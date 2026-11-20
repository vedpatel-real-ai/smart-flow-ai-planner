import { beforeAll, describe, expect, it } from "vitest";
import { account } from "./account";

describe("Authenticated owner boundaries through the local data API", () => {
  let alice: Awaited<ReturnType<typeof account>>;
  let bob: typeof alice;
  const a = crypto.randomUUID();
  const b = crypto.randomUUID();

  beforeAll(async () => {
    [alice, bob] = await Promise.all([account(), account()]);
    for (const [workspace, id] of [[alice, a], [bob, b]] as const) {
      const category = await workspace.db.from("categories").select("id").limit(1).single().throwOnError();
      await workspace.db.from("tasks").insert({
        id, user_id: workspace.owner, title: "Scoped task", category_id: category.data!.id,
      }).throwOnError();
    }
  },30000);

  it("isolates task reads, updates, deletes, parent links and owner changes", async () => {
    const { db } = alice;
    expect((await db.from("tasks").select("id").eq("id",b).throwOnError()).data).toEqual([]);
    expect((await db.from("tasks").update({title:"Changed"}).eq("id",b).select("id").throwOnError()).data).toEqual([]);
    expect((await db.from("tasks").delete().eq("id",b).select("id").throwOnError()).data).toEqual([]);
    expect((await db.from("tasks").update({user_id:bob.owner}).eq("id",a)).error?.code).toBe("42501");
    expect((await db.from("tasks").update({parent_task_id:b}).eq("id",a)).error?.code).toBe("23503");
    const {data} = await bob.db.from("tasks").select("title,id").eq("id",b).single().throwOnError();
    expect(data).toEqual({id:b,title:"Scoped task"});
  });

  it("rejects category mismatches and completion requests for foreign tasks", async () => {
    const {data:category} = await bob.db.from("categories").select("id").limit(1).single().throwOnError();
    expect((await alice.db.from("tasks").update({category_id:category!.id}).eq("id",a)).error?.code).toBe("23503");
    expect((await alice.db.rpc("complete_task",{p_task_id:b})).error?.code).toBe("P0002");
    expect((await alice.db.from("task_completions").insert({user_id:alice.owner,task_id:b})).error?.code).toBe("42501");
    expect((await bob.db.from("task_completions").select("id").eq("task_id",b).throwOnError()).data).toEqual([]);
  });

  it("permits same-owner time blocks and isolates other owners' links and edits", async () => {
    const values = {block_date:"2032-05-08", start_time:"09:00", end_time:"10:00"};
    const {data:block} = await bob.db.from("time_blocks").insert({
      ...values,user_id:bob.owner,task_id:b,
    }).select("id").single().throwOnError();
    expect((await alice.db.from("time_blocks").insert({...values,user_id:alice.owner,task_id:b})).error?.code).toBe("23503");
    expect((await alice.db.from("time_blocks").update({start_time:"09:15"}).eq("id",block!.id).select("id").throwOnError()).data).toEqual([]);
    expect((await alice.db.from("time_blocks").delete().eq("id",block!.id).select("id").throwOnError()).data).toEqual([]);
    expect((await bob.db.from("time_blocks").select("start_time").eq("id",block!.id).single().throwOnError()).data?.start_time).toBe("09:00:00");
  });
});
