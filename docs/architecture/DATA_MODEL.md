# Data model and upgrades

Each cloud task belongs to one Supabase Auth user. The browser sends a session token to the Data API or scoring function. PostgreSQL evaluates row-level security (RLS) for that user. Foreign keys enforce ownership when a write links two records.

| Relation | Contents | Ownership and deletion |
| --- | --- | --- |
| `auth.users` | Supabase-managed accounts | Deleting an account cascades to its planner records. |
| `profiles` | Display name and stored timezone preference | One row per account. The browser currently uses device-local calendar time. |
| `user_preferences` | Work hours, daily task limit and suggestion visibility | One row per account. Signup defaults to 09:00–17:00, eight tasks and suggestions enabled. |
| `categories` | Named, colored task categories | Deleting a category clears its tasks' category reference. The new signup trigger seeds Work, Personal, Study and Health. Existing category lists and settings are preserved. |
| `tasks` | Title, description, priority, deadline, duration, placement, recurrence, status and cached ranking score | The category and legacy parent links reference records with the same owner. Legacy parent deletion cascades to subtasks. New recurring occurrences have independent IDs and a shared series ID. |
| `task_completions` | Completion instant, UTC date and optional measured duration | One event per completed task. Deleting the task also deletes its event. Analytics groups the recorded instant by the device's calendar date. |
| `time_blocks` | Date and start/end times in the original standalone schema | Existing rows survive upgrade. RLS and a composite foreign key protect the optional task link. The current planner places tasks through `tasks.scheduled_start`. |
| `planner_private.creation_receipts` | Account, request ID and SHA-256 of the canonical create payload | Stored in an unexposed schema. A receipt survives task deletion, so replaying a delayed create cannot resurrect deleted work. Account deletion removes its receipts. |

## Write paths

- **Create tasks.** The client supplies stable UUIDs for the whole batch. `create_task_batch` validates the authenticated owner, records a receipt keyed by the first ID and inserts the rows in one transaction. An identical retry returns the original IDs. Reusing that key with a changed payload fails. The transaction rolls back its receipt if any member fails. A unique owner/series/occurrence index prevents duplicate members.
- **Reserve time.** Placing an open task updates `scheduled_start`. A PostgreSQL exclusion constraint compares the owner's occupied intervals, including when two connections write concurrently. Duration defaults to 30 minutes for an unknown estimate. Adjacent intervals are valid. Completing a task frees its interval. A deadline remains independent of placement.
- **Record completion.** `complete_task` locks the owned row and transitions an open task. Database triggers set its completion instant and append its event in the same transaction. These triggers also cover ordinary inserts and status updates. The history trigger runs with narrowly scoped elevated privileges, checks its source table and caller identity, and has a fixed search path. Clients can read their history. A repeat call returns the same task ID.
- **Refresh scores.** The Edge Function sends a batch of scores with the observed task versions. `persist_task_scores` uses RLS, the caller's ID, open status and matching `updated_at` values for every update. If any row fails to match, the entire batch rolls back.
- **Create account defaults.** The signup trigger reads the inserted Auth row. It runs with elevated privileges because the new user cannot yet insert authenticated rows. A table and operation check binds it to account creation and execution grants exclude application roles. Display metadata supplies presentation text only.

Composite foreign keys cover `tasks.category_id`, `tasks.parent_task_id`, `task_completions.task_id` and `time_blocks.task_id`. They include the referencing and referenced owner IDs. The browser's public client key and the caller's authenticated session are sufficient for normal use. [Schema migrations](../../supabase/migrations/) · [Generated TypeScript schema](../../src/integrations/supabase/types.ts) · [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Migration history

| Version | Historical state | Current behavior |
| --- | --- | --- |
| `20250715114404` | Five public tables with enum task fields, four signup categories, eight-task default and indexes. A hyphen after the timestamp could cause the CLI to skip the file. | The filename now uses the recognized underscore separator and retains the original version. A guard recognizes the later standalone bootstrap during an out-of-order upgrade. |
| `20260407085132` | Recreated the same tables with text/check fields, changed defaults, omitted signup categories and added `time_blocks`. Installing both original files in order collided on `profiles`. | Adds the time-block table and its owner policies on the first baseline. A database that already recorded this version receives changes in the next migration. |
| `20261120185618` | Forward reconciliation | Normalizes enums, defaults, nullability and indexes across both baselines. Adds owner-qualified references, completion transactions, interval exclusion, series identity, retry receipts and guarded score persistence. |

The forward migration requires PostgreSQL 15 or newer and the `btree_gist` extension. It fills missing scalar defaults and retains explicit user choices, including an existing ten-task limit. Existing tasks keep their identifiers, parent links, deadlines and descriptions. The old planner displayed each deadline as a placement. An unambiguous open interval is copied to `scheduled_start`. Where legacy intervals overlap, all affected tasks keep their deadlines and return to the unscheduled backlog. Older unlinked recurring copies have no reliable series identity and remain individually editable. No attempt is made to infer which unrelated records belong together.

For a legacy completed task with a recorded event, that event's timestamp becomes the task's canonical completion instant. A completed task with a known instant and missing event receives an event for that instant. Duplicate history, history on an open task and completions without a known instant require review. The migration preserves the existing measured duration when reconciling a recorded event.

### Checking a populated installation

Use a protected staging copy and a verified backup for upgrade review. First record the migration ledger and compare its applied versions with the table above. The original report established both schema shapes independently. It supplied no hosted migration ledger. The following read-only queries identify data that needs a decision before constraints can be validated.

```sql
-- Task relationships with different owners
select t.id, t.category_id, t.parent_task_id
from public.tasks t
left join public.categories c on c.id = t.category_id
left join public.tasks p on p.id = t.parent_task_id
where c.user_id <> t.user_id or p.user_id <> t.user_id;

-- History inconsistencies
select c.id, c.task_id from public.task_completions c
join public.tasks t on t.id = c.task_id
where c.user_id <> t.user_id or t.status <> 'Completed';
select task_id, count(*) from public.task_completions
group by task_id having count(*) > 1;
select t.id from public.tasks t
where t.status = 'Completed' and t.completed_at is null
and not exists (select from public.task_completions c where c.task_id = t.id);

-- Unrepresentable titles, durations or recurrence intervals
select id from public.tasks
where length(trim(title)) = 0 or estimated_duration not between 1 and 1440
or recurrence_interval not between 1 and 365;

-- Run on installations that already have time_blocks
select b.id, b.task_id from public.time_blocks b
join public.tasks t on t.id = b.task_id where b.user_id <> t.user_id;
```

Review flagged IDs privately with the data owner. A category or parent link can be corrected or cleared without deleting the task. Verify the intended owner of history and time blocks from a trusted record. Recover a known completion instant or resolve duplicate events under a reviewed repair plan. An unresolved violation aborts the forward migration. The test suite verifies rollback with an inconsistent imported fixture.

For a **fresh disposable local stack**, start the stack and inspect `supabase migration list --local`. To recreate a dedicated empty test database use `supabase db reset --local` on that stack only. For a **populated staging copy** of either supported baseline, compare the connected database and ledger, then use the pinned CLI's `db push --dry-run --include-all` against that copy. The text-only baseline has a missing earlier version, so the actual staged push needs `--include-all`. The guard recognizes the existing tables, the CLI records the earlier version, and the forward migration reconciles the schema. Preserve the old version records. A manually imported or partially applied schema with a different ledger requires inventory and a separately reviewed staging repair.

Re-run the application checks, verify retained synthetic records and compare the resulting columns and constraints to a fresh installation. The native suite runs the original migration files directly from the audited Git revision, populates each database, then upgrades through the pinned CLI and compares schemas. Its isolated clusters and the local Supabase HTTP suite cover different boundaries. [Database regressions](../../tests/database/planning.test.mjs) · [Data API authorization tests](../../tests/integration/ownership.test.ts) · [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations)
