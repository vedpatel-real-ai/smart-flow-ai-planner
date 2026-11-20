import { describe, expect, it } from "vitest";
import { demoService, demoStoreKey, resetDemo } from "../../src/providers/DemoProvider";
import { demoUserProfile } from "../../src/demo/users";
import { newTask, plannerContract } from "../contracts/planner";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
const owner = demoUserProfile.id;
// The lock callback does all store reads and writes synchronously.
const exclusive = async <T>(fn: () => T) => fn();
describe("Demo workspace", () => {
  plannerContract(async () => ({ owner, service: demoService(owner, new MemoryStorage(), exclusive) }));
  it("preserves a task after reload and rolls back an interrupted completion", async () => {
    const store = new MemoryStorage();
    const service = demoService(owner, store, exclusive);
    const task = newTask(owner, "Injected storage failure");
    await service.create([task]);
    const raw = store.getItem(demoStoreKey);
    const previous = store.setItem.bind(store);
    store.setItem = () => {
      throw new Error("Quota exceeded");
    };
    await expect(service.complete(task.id)).rejects.toThrow("Quota");
    expect(store.getItem(demoStoreKey)).toBe(raw);
    store.setItem = previous;
    await service.complete(task.id);
    const reloaded = await demoService(owner, store, exclusive).snapshot();
    expect(reloaded.completions.filter((c) => c.task_id === task.id)).toHaveLength(1);
    await resetDemo(store, exclusive);
    expect((await service.snapshot()).tasks.find((row) => row.id === task.id)).toBeUndefined();
  });
  it("upgrades legacy placements and history while preserving ambiguous deadlines", async () => {
    const storage = new MemoryStorage();
    const service = demoService(owner, storage, exclusive);
    const snapshot = await service.snapshot();
    const a = newTask(owner, "A", { due_date: "2028-06-01T10:00:00Z", estimated_duration: 90 });
    const b = newTask(owner, "B", { due_date: "2028-06-01T11:00:00Z" });
    const c = newTask(owner, "C", {
      due_date: "2028-06-01T13:00:00Z",
      status: "Completed",
      completed_at: "2028-06-01T14:00:00Z",
    });
    storage.setItem(
      demoStoreKey,
      JSON.stringify({
        tasks: [a, b, c],
        categories: snapshot.categories,
        user_preferences: [snapshot.preferences],
        task_completions: snapshot.completions,
      }),
    );
    const migrated = await service.snapshot();
    expect(migrated.tasks.find((row) => row.id === a.id)).toMatchObject({
      scheduled_start: null,
      due_date: a.due_date,
    });
    expect(migrated.tasks.find((row) => row.id === b.id)?.scheduled_start).toBeNull();
    expect(migrated.completions.map((event) => event.task_id)).toEqual([c.id]);
    expect((await service.snapshot()).completions).toEqual(migrated.completions);
  });
  it("keeps corrupted data intact until an explicit reset", async () => {
    const storage = new MemoryStorage();
    storage.setItem(demoStoreKey, "{}");
    await expect(demoService(owner, storage, exclusive).snapshot()).rejects.toThrow();
    expect(storage.getItem(demoStoreKey)).toBe("{}");
  });
});

it("reopens a customized version 2 store without changing its saved bytes", async () => {
  const storage = new MemoryStorage();
  const service = demoService(owner, storage, exclusive);
  const initial = await service.snapshot();
  const task = newTask(owner, "Custom review", {
    category_id: initial.categories[0].id,
    scheduled_start: "2034-05-03T09:00:00Z",
    due_date: "2034-05-04T17:00:00Z",
  });
  await service.create([task]);
  await service.complete(task.id);
  await service.setSuggestions(false);
  const raw = storage.getItem(demoStoreKey)!;
  expect(JSON.parse(raw).version).toBe(2);
  const reopened = await demoService(owner, storage, exclusive).snapshot();
  expect(reopened.tasks.find(t => t.id === task.id)).toMatchObject({
    title: task.title, scheduled_start: task.scheduled_start, due_date: task.due_date,
    status: "Completed", category_id: task.category_id,
  });
  expect(reopened.completions.filter(e => e.task_id === task.id)).toHaveLength(1);
  expect(reopened.preferences.ai_suggestions_enabled).toBe(false);
  expect(storage.getItem(demoStoreKey)).toBe(raw);
});
