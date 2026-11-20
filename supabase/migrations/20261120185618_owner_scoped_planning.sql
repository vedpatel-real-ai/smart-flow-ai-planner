-- Prerequisite: PostgreSQL 15+ (column-specific SET NULL).
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create schema if not exists planner_private;
revoke all on schema planner_private from public, anon;
grant usage on schema planner_private to authenticated;

-- Converge the historically separate text/check and enum installs on enums.
do $$
begin
  if to_regtype('public.priority_level') is null then
    create type public.priority_level as enum ('Low', 'Medium', 'High', 'Critical');
    create type public.task_status as enum ('Pending', 'Completed', 'Overdue');
    create type public.recurrence_type as enum ('Daily', 'Weekly', 'Monthly', 'Custom');
  end if;
  if (select udt_name from information_schema.columns
      where table_schema = 'public' and table_name = 'tasks' and column_name = 'priority_level') = 'text' then
    alter table public.tasks
      drop constraint tasks_priority_level_check, drop constraint tasks_status_check,
      drop constraint tasks_recurrence_type_check, alter priority_level drop default, alter status drop default;
    alter table public.tasks
      alter priority_level type public.priority_level using priority_level::public.priority_level,
      alter status type public.task_status using status::public.task_status,
      alter recurrence_type type public.recurrence_type using recurrence_type::public.recurrence_type;
  end if;
end $$;

-- Null values in the first bootstrap represented unspecified defaults.
update public.profiles set timezone='UTC' where timezone is null;
update public.categories set color='#3B82F6' where color is null;
update public.tasks set priority_level=coalesce(priority_level,'Medium'), status=coalesce(status,'Pending'),
  is_recurring=coalesce(is_recurring,false), ai_priority_score=coalesce(ai_priority_score,0)
where priority_level is null or status is null or is_recurring is null or ai_priority_score is null;
update public.user_preferences set daily_task_limit=coalesce(daily_task_limit,8),
  preferred_work_hours=coalesce(preferred_work_hours,'{"start":"09:00","end":"17:00"}'),
  ai_suggestions_enabled=coalesce(ai_suggestions_enabled,true)
where daily_task_limit is null or preferred_work_hours is null or ai_suggestions_enabled is null;

alter table public.profiles alter timezone set not null;
alter table public.categories alter color set default '#3B82F6', alter color set not null;
alter table public.user_preferences alter daily_task_limit set default 8, alter daily_task_limit set not null,
  alter preferred_work_hours set not null, alter ai_suggestions_enabled set not null;
alter table public.tasks alter status set default 'Pending', alter status set not null,
  alter priority_level set default 'Medium', alter priority_level set not null,
  alter is_recurring set not null, alter ai_priority_score type numeric, alter ai_priority_score set not null,
  alter tags set default '{}',
  add column scheduled_start timestamptz,
  add column series_id uuid,
  add column occurrence_index integer,
  add constraint tasks_series_member check ((series_id is null) = (occurrence_index is null) and occurrence_index >= 0),
  add constraint tasks_series_ordinal unique (user_id, series_id, occurrence_index),
  add constraint tasks_duration check (estimated_duration between 1 and 1440),
  add constraint tasks_title check (length(trim(title)) > 0),
  add constraint tasks_interval check (recurrence_interval between 1 and 365);

-- Constraint validation rejects existing mismatches and rolls back this migration.
-- The runbook includes read-only preflight queries and repair options.
alter table public.categories add constraint categories_owner_id unique (user_id, id);
alter table public.tasks add constraint tasks_owner_id unique (user_id, id);
alter table public.tasks drop constraint tasks_category_id_fkey, drop constraint tasks_parent_task_id_fkey,
  add constraint tasks_category_id_fkey foreign key (user_id, category_id)
    references public.categories(user_id, id) on delete set null (category_id),
  add constraint tasks_parent_task_id_fkey foreign key (user_id, parent_task_id)
    references public.tasks(user_id, id) on delete cascade;
alter table public.task_completions drop constraint task_completions_task_id_fkey,
  add constraint task_completions_task_id_fkey foreign key (user_id, task_id)
    references public.tasks(user_id, id) on delete cascade,
  add constraint one_completion_per_task unique(task_id);
alter table public.time_blocks drop constraint time_blocks_task_id_fkey,
  add constraint time_blocks_task_id_fkey foreign key (user_id, task_id)
    references public.tasks(user_id, id) on delete cascade;
create index tasks_category_idx on public.tasks(user_id, category_id) where category_id is not null;
create index tasks_parent_idx on public.tasks(user_id, parent_task_id) where parent_task_id is not null;
create index time_blocks_task_idx on public.time_blocks(user_id, task_id);
create index if not exists idx_tasks_due_date on public.tasks(due_date);
create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_priority on public.tasks(priority_level);
create index if not exists idx_tasks_user_id on public.tasks(user_id);
create index if not exists idx_task_completions_user_date on public.task_completions(user_id, completion_date);
create index if not exists idx_categories_user_id on public.categories(user_id);

-- Compute on the UTC timeline to avoid session timezone or DST variations.
create function planner_private.occupied(starts timestamptz, minutes integer)
returns tsrange language sql immutable strict set search_path = '' as $$
  select tsrange(starts at time zone 'UTC',
    (starts at time zone 'UTC') + make_interval(mins => minutes), '[)')
$$;

-- Preserve legacy placements where the old planner's deadline interval is unambiguous.
-- Conflicted tasks retain their deadlines and remain available for manual placement.
update public.tasks t set scheduled_start=t.due_date
where t.due_date is not null and t.status <> 'Completed'
and not exists (
  select 1 from public.tasks other where other.user_id=t.user_id and other.id<>t.id
    and other.status <> 'Completed' and other.due_date is not null
    and planner_private.occupied(other.due_date,coalesce(other.estimated_duration,30))
     && planner_private.occupied(t.due_date,coalesce(t.estimated_duration,30))
);
alter table public.tasks add constraint tasks_no_overlap exclude using gist (
  user_id with =, planner_private.occupied(scheduled_start,coalesce(estimated_duration,30)) with &&
) where (scheduled_start is not null and status <> 'Completed');

-- Keep the original signup trigger attached in either history. This function is
-- callable only as the INSERT trigger on auth.users; user metadata is display-only.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_relid <> 'auth.users'::regclass or tg_op <> 'INSERT' then
    raise exception 'Invalid signup trigger';
  end if;
  insert into public.profiles(user_id, display_name)
    values (new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(new.email,'@',1),'Account'));
  insert into public.user_preferences(user_id) values(new.id);
  insert into public.categories(user_id,name,color) values
    (new.id,'Work','#3B82F6'), (new.id,'Personal','#10B981'),
    (new.id,'Study','#8B5CF6'), (new.id,'Health','#F59E0B');
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Reuse dated evidence when fixing legacy partial completions. If the two
-- sources contradict each other or neither records an instant, require review.
do $$
begin
  if exists (select from public.task_completions c join public.tasks t on t.id=c.task_id where t.status <> 'Completed') then
    raise exception 'Review completion history attached to open tasks before upgrading';
  end if;
  if exists (select from public.tasks t where status='Completed' and completed_at is null
             and not exists (select from public.task_completions c where c.task_id=t.id)) then
    raise exception 'Review completed tasks without a recorded completion time before upgrading';
  end if;
end $$;
update public.tasks t set completed_at=c.completed_at from public.task_completions c
where t.id=c.task_id and t.completed_at is distinct from c.completed_at;
insert into public.task_completions(user_id,task_id,completed_at,completion_date)
select user_id,id,completed_at,(completed_at at time zone 'UTC')::date from public.tasks
where status='Completed' on conflict(task_id) do nothing;

create function planner_private.prepare_completion() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and old.status='Completed' then
    if new.status <> 'Completed' then raise exception 'Completed tasks cannot be reopened'; end if;
    new.completed_at := old.completed_at;
  elsif new.status='Completed' then
    new.completed_at := clock_timestamp();
  else
    new.completed_at := null;
  end if;
  if new.status='Completed' then new.ai_priority_score:=0; end if;
  return new;
end $$;
create trigger prepare_completion before insert or update of status, completed_at on public.tasks
for each row execute function planner_private.prepare_completion();

-- The only elevated operation after sign-in appends the task's canonical
-- completion event. Clients have no direct history-write privilege.
create function planner_private.append_completion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_relid <> 'public.tasks'::regclass or new.user_id is distinct from auth.uid() then
    raise exception 'Invalid completion owner' using errcode='42501';
  end if;
  insert into public.task_completions(user_id,task_id,completed_at,completion_date)
  values (new.user_id,new.id,new.completed_at,(new.completed_at at time zone 'UTC')::date);
  return new;
end $$;
revoke all on function planner_private.append_completion() from public, anon, authenticated;
create trigger record_completed_insert after insert on public.tasks for each row
  when (new.status='Completed') execute function planner_private.append_completion();
create trigger record_completed_update after update of status on public.tasks for each row
  when (new.status='Completed' and old.status<>'Completed') execute function planner_private.append_completion();

create function public.complete_task(p_task_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare found_status public.task_status;
begin
  select status into strict found_status from public.tasks where id=p_task_id and user_id=auth.uid() for update;
  if found_status <> 'Completed' then
    update public.tasks set status='Completed' where id=p_task_id and user_id=auth.uid();
  end if;
  return p_task_id;
end $$;

-- Receipts survive task deletion to prevent re-creation by a delayed retry.
create table planner_private.creation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  fingerprint bytea not null,
  primary key(user_id, request_id)
);
alter table planner_private.creation_receipts enable row level security;
create policy receipts_read on planner_private.creation_receipts for select to authenticated using (user_id=(select auth.uid()));
create policy receipts_insert on planner_private.creation_receipts for insert to authenticated with check (user_id=(select auth.uid()));
grant select,insert on planner_private.creation_receipts to authenticated;

create function public.create_task_batch(p_tasks jsonb) returns uuid[]
language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid := auth.uid();
  ids uuid[];
  fingerprint bytea := sha256(convert_to(p_tasks::text,'UTF8'));
  prior bytea;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_tasks is null or jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks) not between 1 and 100 then
    raise exception 'Expected 1 to 100 tasks' using errcode='22023';
  end if;
  if exists (select from jsonb_array_elements(p_tasks) item where item ? 'user_id'
             and (item->>'user_id')::uuid is distinct from owner_id) then
    raise exception 'Task owner differs from authenticated account' using errcode='42501';
  end if;
  select array_agg((item->>'id')::uuid order by n) into ids from jsonb_array_elements(p_tasks) with ordinality as inputs(item,n);
  if array_position(ids,null) is not null then raise exception 'Each task requires a stable ID' using errcode='22023'; end if;
  insert into planner_private.creation_receipts(user_id,request_id,fingerprint)
    values(owner_id,ids[1],fingerprint) on conflict do nothing;
  if not found then
    select r.fingerprint into strict prior from planner_private.creation_receipts r where r.user_id=owner_id and r.request_id=ids[1];
    if prior<>fingerprint then raise exception 'Request ID reused with different tasks' using errcode='23505'; end if;
    return ids;
  end if;
  insert into public.tasks(id,user_id,title,description,due_date,scheduled_start,priority_level,category_id,
                           tags,is_recurring,recurrence_type,recurrence_interval,estimated_duration,series_id,occurrence_index,parent_task_id)
  select t.id,owner_id,trim(t.title),t.description,t.due_date,t.scheduled_start,coalesce(t.priority_level,'Medium'),t.category_id,
         t.tags,coalesce(t.is_recurring,false),t.recurrence_type,t.recurrence_interval,t.estimated_duration,t.series_id,t.occurrence_index,t.parent_task_id
  from jsonb_to_recordset(p_tasks) as t(id uuid,title text,description text,due_date timestamptz,scheduled_start timestamptz,
    priority_level public.priority_level,category_id uuid,tags text[],is_recurring boolean,recurrence_type public.recurrence_type,
    recurrence_interval integer,estimated_duration integer,series_id uuid,occurrence_index integer,parent_task_id uuid);
  return ids;
end $$;

create function public.persist_task_scores(p_scores jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_scores is null or jsonb_typeof(p_scores)<>'array' then raise exception 'Expected score array' using errcode='22023'; end if;
  update public.tasks t set ai_priority_score=s.score
    from jsonb_to_recordset(p_scores) as s(id uuid,updated_at timestamptz,score numeric)
    where t.user_id=auth.uid() and t.status<>'Completed' and t.id=s.id and t.updated_at=s.updated_at and s.score between 0 and 12;
  get diagnostics affected=row_count;
  if affected<>jsonb_array_length(p_scores) then
    raise exception 'Tasks changed during scoring' using errcode='40001';
  end if;
  return affected;
end $$;

create or replace function public.update_updated_at_column() returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  return new;
end $$;
revoke all on function public.update_updated_at_column() from public, anon, authenticated;
revoke all on function public.create_task_batch(jsonb),public.complete_task(uuid),public.persist_task_scores(jsonb)
  from public, anon, authenticated;
grant execute on function public.create_task_batch(jsonb),public.complete_task(uuid),public.persist_task_scores(jsonb) to authenticated;
revoke all on table public.tasks,public.categories,public.time_blocks,public.task_completions,public.profiles,public.user_preferences
  from public, anon, authenticated;
grant select,insert,update,delete on public.tasks,public.categories,public.time_blocks to authenticated;
grant select,update on public.profiles,public.user_preferences to authenticated;
grant select on public.task_completions to authenticated;
