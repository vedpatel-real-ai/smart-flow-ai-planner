import { beforeAll, describe, expect, it } from "vitest";
import { cloudService } from "../../src/providers/SupabaseProvider";
import { SavedRankingError } from "../../src/providers/contract";
import { newTask, plannerContract } from "../contracts/planner";

import { account, key, url } from "./account";

describe("Local Supabase through Auth, PostgREST, the Edge handler and PostgreSQL", () => {
  let first: Awaited<ReturnType<typeof account>>;
  let second: Awaited<ReturnType<typeof account>>;
  beforeAll(async () => {
    first = await account();
    second = await account();
  }, 30000);
  plannerContract(async () => first);
  it("ranks only tasks visible to the caller and persists the actual score", async () => {
    const task = newTask(first.owner, "Visible only in first workspace", {
      priority_level: "Critical",
      estimated_duration: 30,
    });
    await first.service.create([task]);
    expect((await second.service.snapshot()).tasks).toEqual([]);
    const changed = await first.db.from("tasks").update({ ai_priority_score: 0 }).eq("id", task.id).select(
      "id",
    ).single();
    expect(changed.error).toBeNull();
    await expect(cloudService(second.db, first.owner).refreshScores()).rejects.toThrow("session changed");
    await second.service.refreshScores();
    expect((await first.service.snapshot()).tasks.find((row) => row.id === task.id)?.ai_priority_score).toBe(
      0,
    );
    await first.service.refreshScores();
    expect((await first.service.snapshot()).tasks.find((row) => row.id === task.id)?.ai_priority_score).toBe(
      8.3,
    );
    await first.service.remove(task.id);
  });
  it("reports a committed task separately from an interrupted ranking request", async () => {
    let interrupt = true;
    const isolated = await account((input, init) => {
      if (interrupt && new URL(String(input)).pathname.endsWith("/functions/v1/task-priority")) {
        throw new TypeError("Simulated connection loss");
      }
      return fetch(input, init);
    });
    const task = newTask(isolated.owner, "A durable write", { priority_level: "High" });
    await expect(isolated.service.create([task])).rejects.toBeInstanceOf(SavedRankingError);
    const saved = await isolated.service.snapshot();
    expect(saved.tasks).toHaveLength(1);
    expect(saved.tasks[0]).toMatchObject({ id: task.id, ai_priority_score: 0 });
    interrupt = false;
    await isolated.service.refreshScores();
    expect((await isolated.service.snapshot()).tasks[0]).toMatchObject({ id: task.id, ai_priority_score: 6 });
  });
  it("loads and scores every task past the default REST response limit", async () => {
    const isolated = await account();
    const rows = Array.from({ length: 1005 }, (_, index) => ({
      id: crypto.randomUUID(),
      user_id: isolated.owner,
      title: "Pagination fixture " + index,
    }));
    const { error } = await isolated.db.from("tasks").insert(rows);
    expect(error).toBeNull();
    await isolated.service.refreshScores();
    const saved = await isolated.service.snapshot();
    expect(new Set(saved.tasks.map((task) => task.id))).toEqual(new Set(rows.map((task) => task.id)));
    expect(saved.tasks.every((task) => task.ai_priority_score === 4)).toBe(true);
  });
  it("rejects an expired or missing bearer at the function boundary", async () => {
    for (const headers of [{ apikey: key! }, { apikey: key!, Authorization: "Bearer expired-fixture" }]) {
      const res = await fetch(url + "/functions/v1/task-priority", { method: "POST", headers });
      expect(res.status).toBe(401);
    }
  });
});
