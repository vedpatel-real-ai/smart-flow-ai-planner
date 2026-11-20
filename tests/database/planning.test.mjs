import { localCli } from "../../scripts/local-cli.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import EmbeddedPostgres from "embedded-postgres";

const migrationDir = new URL("../../supabase/migrations/", import.meta.url);
const history = "fda439e2e94c502890c2600e14e7c927670fdc57";
const versions = (await readdir(migrationDir)).sort();
const migrations = await Promise.all(versions.map(name => readFile(new URL(name, migrationDir), "utf8")));
const originals = [
  "20250715114404-d4a778b5-3431-4d5d-b7a7-6e3752abff59.sql",
  "20260407085132_d81d11ba-f568-4603-a650-fb9abe37f76b.sql",
].map(name => execFileSync("git", ["show", history + ":supabase/migrations/" + name], { encoding: "utf8" }));
const owner = randomUUID();
const neighbor = randomUUID();
const bootstrap = `
  create schema auth;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  grant usage on schema auth to authenticated;
`;
let server;
let admin;
let dbName;
let main;
let app;
let other;

async function connect(name) {
  const client = server.getPgClient(name, "127.0.0.1");
  await client.connect();
  return client;
}

async function newDatabase() {
  const name = "planner_" + randomUUID().replaceAll("-", "");
  await server.createDatabase(name);
  const client = await connect(name);
  await client.query(bootstrap);
  return { name, client };
}

// Use the pinned CLI against this test's random loopback cluster. No host project is linked.
function migrateFromLedger(client, version) {
  const { user, password, host, port, database } = client.connectionParameters;
  assert.equal(host, "127.0.0.1");
  assert.match(database, /^planner_[a-z0-9]+$/);
  const url = new URL("postgresql://127.0.0.1");
  url.username = user;

  url.port = String(port);
  url.pathname = database;
  const invoke = args => execFileSync(localCli, [...args, "--db-url",url.toString(),"--yes"], {
    encoding: "utf8", stdio: ["ignore","pipe","pipe"], env:{...process.env,PGPASSWORD:password,PGSSLMODE:"disable"},
  });
  // The fixture just executed this original version, as a historical CLI would have.
  invoke(["migration","repair",version,"--status","applied"]);
  invoke(["db","push","--include-all"]);
}

async function shape(client) {
  const columns = await client.query(`select table_name,column_name,udt_name,is_nullable,column_default
    from information_schema.columns where table_schema='public' order by table_name,column_name`);
  const constraints = await client.query(`select conrelid::regclass::text as rel,pg_get_constraintdef(oid) as definition
    from pg_constraint where connamespace='public'::regnamespace and contype in ('c','f','p','u','x')
    order by rel,definition`);
  return { columns:columns.rows,constraints:constraints.rows };
}

async function login(name, user) {
  const c = await connect(name);
  await c.query("set role authenticated");
  await c.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  return c;
}

async function signup(client, id) {
  await client.query("insert into auth.users values ($1,'tester@example.invalid','{}')", [id]);
}

async function count(client, sql, args = []) {
  return (await client.query(sql, args)).rowCount;
}

const batch = (client, tasks) => client.query("select create_task_batch($1::jsonb) as ids", [JSON.stringify(tasks)]);
const complete = (client, id) => client.query("select complete_task($1)", [id]);
const assertCode = (promise, code) => assert.rejects(promise, { code });

before(async () => {
  const reservation = createServer();
  await new Promise((resolve, reject) => reservation.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const databaseDir = await mkdtemp(path.join(tmpdir(), "smart-flow-postgres-"));
  server = new EmbeddedPostgres({
    databaseDir, port, user: "postgres", password: randomUUID(), persistent: false,
    postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "unix_socket_directories=" + databaseDir],
    autoRehydrateSymlinks: true, onLog: () => {}, onError: () => {},
  });
  await server.initialise();
  await server.start();
  admin = await connect("postgres");
  await admin.query("create role authenticated; create role anon");
  const fresh = await newDatabase();
  dbName = fresh.name;
  main = fresh.client;
  for (const sql of migrations) await main.query(sql);
  await signup(main, owner);
  await signup(main, neighbor);
  app = await login(dbName, owner);
  other = await login(dbName, neighbor);
});

after(async () => {
  await Promise.all([admin, main, app, other].filter(Boolean).map(client => client.end()));
  if (server) await server.stop();
});

test("fresh installation provides owner categories, canonical signup defaults and grants", async () => {
  assert.equal(await count(app, "select from categories"), 4);
  const { rows: [prefs] } = await app.query("select * from user_preferences");
  assert.equal(prefs.daily_task_limit, 8);
  assert.equal(prefs.ai_suggestions_enabled, true);
  assert.equal((await app.query("select display_name from profiles")).rows[0].display_name, "tester");
  const { rows: [grants] } = await main.query(`select
    has_function_privilege('anon','public.complete_task(uuid)','execute') as anon_complete,
    has_table_privilege('authenticated','public.task_completions','insert') as direct_history`);
  assert.deepEqual(grants,{anon_complete:false,direct_history:false});
});

for (const [index, label] of ["enum bootstrap", "standalone text bootstrap"].entries()) {
  test("populated " + label + " upgrades without changing IDs, user settings or deadlines", async () => {
    const { client } = await newDatabase();
    try {
      await client.query(originals[index]);
      const id = randomUUID();
      await signup(client,id);
      await client.query("update user_preferences set daily_task_limit=17");
      const { rows: [task] } = await client.query(`insert into tasks(user_id,title,due_date)
        values ($1,'Existing','2030-01-15 09:00+00') returning id`, [id]);
      await client.query(`insert into tasks(user_id,title,due_date) values
        ($1,'Collision one','2030-01-16 09:00+00'),($1,'Collision two','2030-01-16 09:10+00')`,[id]);
      const completed = (await client.query(`insert into tasks(user_id,title,status,completed_at)
        values ($1,'Prior completion','Completed','2030-01-13 21:00+00') returning id`,[id])).rows[0].id;
      // The CLI must apply the missing earlier version for the standalone text case.
      migrateFromLedger(client, versions[index].slice(0,14));
      assert.equal(await count(client,"select from supabase_migrations.schema_migrations"),migrations.length);
      assert.deepEqual(await shape(client),await shape(main));
      const { rows: [kept] } = await client.query("select * from tasks where id=$1",[task.id]);
      assert.equal(kept.user_id,id);
      assert.equal(kept.due_date.toISOString(),kept.scheduled_start.toISOString());
      assert.equal(await count(client,"select from tasks where title like 'Collision%' and due_date is not null and scheduled_start is null"),2);
      assert.equal((await client.query("select daily_task_limit from user_preferences")).rows[0].daily_task_limit,17);
      assert.equal(await count(client,"select from task_completions where task_id=$1",[completed]),1);
      await signup(client,randomUUID());
      assert.equal(await count(client,"select from user_preferences where daily_task_limit=8"),1);
      assert.equal(await count(client,"select from categories where user_id<>$1",[id]),4);
    } finally { await client.end(); }
  });
}

test("conflicting legacy ownership stops migration and preserves the original data", async () => {
  const {client} = await newDatabase();
  try {
    await client.query(originals[0]);
    await signup(client, owner);
    await signup(client, neighbor);
    // Imported inconsistent fixture constructed by the database owner.
    await client.query(`insert into tasks(user_id,title,category_id)
      select $1,'Requires owner review',id from categories where user_id=$2 limit 1`, [owner,neighbor]);
    await client.query(migrations[1]);
    await assertCode(client.query(migrations[2]),"23503");
    assert.equal(await count(client,"select from tasks where title='Requires owner review'"),1);
    assert.equal(await count(client,`select from information_schema.columns where table_name='tasks' and column_name='series_id'`),0);
  } finally { await client.end(); }
});

test("authenticated roles see and change only their own rows and same-owner links", async () => {
  const category = (await app.query("select id from categories limit 1")).rows[0].id;
  const foreignCategory = (await other.query("select id from categories limit 1")).rows[0].id;
  const id = randomUUID();
  const foreign = randomUUID();
  await batch(app,[{id,title:"My task",category_id:category}]);
  await batch(other,[{id:foreign,title:"Neighbor's task"}]);
  const child = randomUUID();
  await batch(app,[{id:child,title:"Same-owner child",parent_task_id:id}]);
  assert.equal((await app.query("select parent_task_id from tasks where id=$1",[child])).rows[0].parent_task_id,id);
  await assertCode(batch(app,[{id:randomUUID(),title:"Invalid parent",parent_task_id:foreign}]),"23503");
  await assertCode(batch(app,[{id:randomUUID(),title:"Invalid link",category_id:foreignCategory}]),"23503");
  await assertCode(batch(app,[{id:randomUUID(),title:"Wrong owner",user_id:neighbor}]),"42501");
  await assertCode(app.query("update tasks set parent_task_id=$1 where id=$2",[foreign,id]),"23503");
  await assertCode(app.query("update tasks set user_id=$1 where id=$2",[neighbor,id]),"42501");
  const block = (await other.query(`insert into time_blocks(user_id,task_id,block_date,start_time,end_time)
    values($1,$2,current_date,'09:00','10:00') returning id`,[neighbor,foreign])).rows[0].id;
  await assertCode(app.query(`insert into time_blocks(user_id,task_id,block_date,start_time,end_time)
    values($1,$2,current_date,'09:00','10:00')`,[owner,foreign]),"23503");
  for (const [table,target] of [["tasks",foreign],["time_blocks",block]]) {
    assert.equal(await count(app,"select from "+table+" where id=$1",[target]),0);
    assert.equal(await count(app,"update "+table+" set id=id where id=$1",[target]),0);
    assert.equal(await count(app,"delete from "+table+" where id=$1",[target]),0);
  }
  await assertCode(complete(app,foreign),"P0002");
  await app.query("delete from categories where id=$1",[category]);
  assert.equal((await app.query("select category_id from tasks where id=$1",[id])).rows[0].category_id,null);
});

test("concurrent completion and a request retried after lost acknowledgment produce one event", async () => {
  const id=randomUUID();
  await batch(app,[{id,title:"Complete concurrently"}]);
  const second=await login(dbName,owner);
  try {
    await Promise.all([complete(app,id),complete(second,id)]);
    await complete(app,id);
    const { rows:[row] }=await app.query(`select t.status,t.completed_at=c.completed_at as same
      from tasks t join task_completions c on c.task_id=t.id where t.id=$1`,[id]);
    assert.deepEqual(row,{status:"Completed",same:true});
    assert.equal(await count(app,"select from task_completions where task_id=$1",[id]),1);
    await app.query("delete from tasks where id=$1",[id]);
    assert.equal(await count(second,"select from task_completions where task_id=$1",[id]),0);
  } finally { await second.end(); }
});

test("an injected history-write failure rolls the task transition back",async ()=>{
  const id=randomUUID();
  await batch(app,[{id,title:"Completion rollback"}]);
  await main.query(`create function planner_private.test_reject_event() returns trigger language plpgsql as $$
    begin raise exception 'fixture rejects event'; end $$;
    create trigger fixture_reject before insert on task_completions for each row execute function planner_private.test_reject_event()`);
  try {
    await assert.rejects(complete(app,id),/fixture rejects event/);
    assert.equal((await app.query("select status from tasks where id=$1",[id])).rows[0].status,"Pending");
    assert.equal(await count(app,"select from task_completions where task_id=$1",[id]),0);
  } finally {await main.query("drop trigger fixture_reject on task_completions; drop function planner_private.test_reject_event()");}
  await complete(app,id);
});

test("series creates atomically, replays across connections, edits and deletes by scope", async () => {
  const series=randomUUID();
  const tasks=[0,1,2].map(i=>({id:randomUUID(),title:"Recurring",series_id:series,occurrence_index:i,
    is_recurring:true,recurrence_type:"Daily",recurrence_interval:2}));
  const second=await login(dbName,owner);
  try {
    const responses=await Promise.all([batch(app,tasks),batch(second,tasks)]);
    for(const response of responses) assert.deepEqual(response.rows[0].ids,tasks.map(t=>t.id));
    await app.query("update tasks set title='Only one' where id=$1",[tasks[0].id]);
    assert.equal(await count(second,"select from tasks where series_id=$1 and title='Recurring'",[series]),2);
    await app.query("update tasks set title='Series edit' where series_id=$1",[series]);
    await batch(app,tasks);
    assert.equal(await count(second,"select from tasks where series_id=$1 and title='Series edit'",[series]),3);
    await app.query("delete from tasks where id=$1",[tasks[0].id]);
    assert.equal(await count(second,"select from tasks where series_id=$1",[series]),2);
    await app.query("delete from tasks where series_id=$1",[series]);
    await batch(app,tasks);
    assert.equal(await count(second,"select from tasks where series_id=$1",[series]),0);
    await assertCode(batch(app,[{...tasks[0],title:"Unrelated retry"}]),"23505");
    const first = {id:randomUUID(),title:"Valid"};
    await assertCode(batch(app,[first,{id:randomUUID(),title:"   "}]),"23514");
    assert.equal(await count(app,"select from tasks where id=$1",[first.id]),0);
    await batch(app,[first]);
  } finally {await second.end();}
});

test("competing reservations enforce duration, cross-midnight and adjacency on the database", async () => {
  const a=randomUUID(), b=randomUUID();
  await batch(app,[{id:a,title:"Late",estimated_duration:90},{id:b,title:"Early",estimated_duration:60}]);
  const second=await login(dbName,owner);
  try {
    const changes=await Promise.allSettled([
      app.query("update tasks set scheduled_start='2033-01-01 23:45+00' where id=$1",[a]),
      second.query("update tasks set scheduled_start='2033-01-02 00:00+00' where id=$1",[b]),
    ]);
    assert.equal(changes.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(changes.find(x=>x.status==="rejected").reason.code,"23P01");
    await app.query("update tasks set scheduled_start=null where id=any($1::uuid[])",[[a,b]]);
    await app.query("update tasks set scheduled_start='2033-01-01 23:45+00' where id=$1",[a]);
    await second.query("update tasks set scheduled_start='2033-01-02 01:15+00' where id=$1",[b]);
    await assertCode(batch(app,[{id:randomUUID(),title:"Conflicting series",scheduled_start:"2033-01-02T00:30:00Z"}]),"23P01");
    await complete(app,a);
    await second.query("update tasks set scheduled_start='2033-01-02 00:00+00' where id=$1",[b]);
  } finally {await second.end();}
});

test("score persistence rejects stale, missing and foreign tasks atomically", async () => {
  const id=randomUUID(), second=randomUUID();
  await batch(app,[{id,title:"A"},{id:second,title:"B"}]);
  const read=async ()=>(await app.query(`select id,updated_at::text,5.5::float as score from tasks where id=any($1::uuid[]) order by id`,[[id,second]])).rows;
  const save=(scores)=>app.query("select persist_task_scores($1::jsonb) as n",[JSON.stringify(scores)]);
  const stale=await read();
  await app.query("update tasks set title='Changed' where id=$1",[second]);
  await assertCode(save(stale),"40001");
  assert.equal(await count(app,"select from tasks where id=any($1::uuid[]) and ai_priority_score=0",[[id,second]]),2);
  assert.equal((await save(await read())).rows[0].n,2);
  const foreign=(await other.query("select id,updated_at::text,3 as score from tasks limit 1")).rows[0];
  await assertCode(save([foreign]),"40001");
  assert.equal((await save([])).rows[0].n,0);
});
