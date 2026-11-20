import { expect, it } from "vitest";
import type { PlannerService } from "../../src/providers/contract";
import type { Task } from "../../src/types/database";

export function newTask(owner: string, title: string, patch: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: owner,
    title,
    status: "Pending",
    is_recurring: false,
    priority_level: "Medium",
    ai_priority_score: 0,
    created_at: now,
    updated_at: now,
    ...patch,
  };
}
export function plannerContract(open: () => Promise<{ service: PlannerService; owner: string }>) {
  it("saves and ranks tasks, updates priorities, loads categories and sorts results", async () => {
    const { service, owner } = await open();
    const before = await service.snapshot();
    const category = before.categories[0];
    expect(category).toBeDefined();
    const a = newTask(owner, "  Contract task  ", { category_id: category.id });
    const b = newTask(owner, "Another task", { priority_level: "High", estimated_duration: 20 });
    await service.create([a, b]);
    const { tasks, categories } = await service.snapshot();
    expect(categories.map((row) => row.name)).toEqual(
      [...categories.map((row) => row.name)].sort((a, b) => a.localeCompare(b)),
    );
    expect(tasks.find((row) => row.id === a.id)).toMatchObject({
      title: "Contract task",
      status: "Pending",
      category,
      ai_priority_score: 4,
    });
    expect(tasks.find((row) => row.id === b.id)?.ai_priority_score).toBe(6.3);
    expect(tasks.indexOf(tasks.find((row) => row.id === b.id)!)).toBeLessThan(
      tasks.indexOf(tasks.find((row) => row.id === a.id)!),
    );
    await service.update(a.id, { priority_level: "Critical" });
    const updated = await service.snapshot();
    expect(updated.tasks.find((row) => row.id === a.id)?.ai_priority_score).toBe(8);
    await service.remove(a.id);
    await service.remove(b.id);
  });
  it("persists one completion across concurrent calls, retry, and deletes its history with the task", async () => {
    const { service, owner } = await open();
    const task = newTask(owner, "Repeatable completion");
    await service.create([task]);
    await Promise.all([service.complete(task.id), service.complete(task.id)]);
    await service.complete(task.id);
    const completed = await service.snapshot();
    expect(completed.tasks.find((row) => row.id === task.id)).toMatchObject({
      status: "Completed",
      ai_priority_score: 0,
    });
    expect(completed.completions.filter((row) => row.task_id === task.id)).toHaveLength(1);
    await service.remove(task.id);
    expect((await service.snapshot()).completions.some((row) => row.task_id === task.id)).toBe(false);
    await expect(service.complete(task.id)).rejects.toThrow();
  });
  it("creates one series on replay, changes all titles, and deletes one occurrence independently", async () => {
    const { service, owner } = await open();
    const series_id = crypto.randomUUID();
    const members = [0, 1, 2].map((occurrence_index) =>
      newTask(owner, "Series", {
        series_id,
        occurrence_index,
        is_recurring: true,
        recurrence_type: "Weekly",
        recurrence_interval: 2,
      })
    );
    await Promise.all([service.create(members), service.create(members)]);
    await service.update(members[1].id, { title: "Every second week" }, "series");
    await service.create(members);
    let matching = (await service.snapshot()).tasks.filter((row) => row.series_id === series_id);
    expect(matching).toHaveLength(3);
    expect(matching.every((row) => row.title === "Every second week")).toBe(true);
    await service.remove(members[0].id);
    matching = (await service.snapshot()).tasks.filter((row) => row.series_id === series_id);
    expect(matching).toHaveLength(2);
    await service.remove(members[1].id, "series");
    expect((await service.snapshot()).tasks.some((row) => row.series_id === series_id)).toBe(false);
    await service.create(members);
    expect((await service.snapshot()).tasks.some((row) => row.series_id === series_id)).toBe(false);
  });
  it("rolls back an overlapping batch and serializes simultaneous placements across midnight", async () => {
    const { service, owner } = await open();
    const a = newTask(owner, "Before midnight", { estimated_duration: 90 });
    const b = newTask(owner, "After midnight", { estimated_duration: 30 });
    const start = "2046-05-01T23:45:00Z", end = "2046-05-02T00:15:00Z";
    await expect(service.create([{ ...a, scheduled_start: start }, { ...b, scheduled_start: end }])).rejects
      .toThrow();
    expect((await service.snapshot()).tasks.some((task) => task.id === a.id || task.id === b.id)).toBe(false);
    await service.create([a, b]);
    const placed = await Promise.allSettled([
      service.update(a.id, { scheduled_start: start }),
      service.update(b.id, { scheduled_start: end }),
    ]);
    expect(placed.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(
      (await service.snapshot()).tasks.filter((task) =>
        (task.id === a.id || task.id === b.id) && task.scheduled_start
      ),
    ).toHaveLength(1);
    await service.remove(a.id);
    await service.remove(b.id);
  });
  it("preserves valid parent links and removes dependent tasks with their parent", async () => {
    const { service, owner } = await open();
    const parent = newTask(owner, "Parent task");
    const child = newTask(owner, "Child task", { parent_task_id: parent.id });
    await service.create([parent, child]);
    expect((await service.snapshot()).tasks.find((task) => task.id === child.id)?.parent_task_id).toBe(
      parent.id,
    );
    await service.remove(parent.id);
    expect((await service.snapshot()).tasks.some((task) => task.id === child.id)).toBe(false);
  });
  it("writes preferences and rejects missing and invalid mutations", async () => {
    const { service, owner } = await open();
    await service.setSuggestions(false);
    expect((await service.snapshot()).preferences.ai_suggestions_enabled).toBe(false);
    await service.setSuggestions(true);
    await expect(service.remove(crypto.randomUUID())).rejects.toThrow();
    await expect(service.create([newTask(owner, "  ")])).rejects.toThrow();
  });
}
