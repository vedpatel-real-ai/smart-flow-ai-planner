import { describe, expect, it } from "vitest";
import { createDemoWorkspace, computeExpectedStreak } from "../../src/demo/fixtures";
import { metrics, recommendations, statusAt } from "../../src/domain/metrics";
import { bookedInterval, overlaps, calendarDay, plannerLists } from "../../src/domain/calendar";
import {
  taskSchema,
  categorySchema,
  completionSchema,
  preferencesSchema,
} from "../../src/providers/contract";

describe("Demo fixture generator", () => {
  // Use a Thursday mid-morning in Asia/Kolkata as the standard reference
  const anchor = new Date("2026-11-19T04:30:00.000Z"); // Thu 10:00 AM IST

  it("generates a coherent workspace with consistent relationships", () => {
    const store = createDemoWorkspace(anchor);
    // All tasks reference valid categories
    const catIds = new Set(store.categories.map((c) => c.id));
    for (const task of store.tasks) {
      if (task.category_id) {
        expect(catIds.has(task.category_id), `Task "${task.title}" has unknown category ${task.category_id}`).toBe(true);
      }
    }
    // All completions reference valid tasks
    const taskIds = new Set(store.tasks.map((t) => t.id));
    for (const c of store.task_completions) {
      expect(taskIds.has(c.task_id), `Completion ${c.id} references unknown task ${c.task_id}`).toBe(true);
    }
    // All task IDs are unique
    expect(taskIds.size).toBe(store.tasks.length);
    // All completion IDs are unique
    expect(new Set(store.task_completions.map((c) => c.id)).size).toBe(store.task_completions.length);
    // Owner consistency
    for (const row of [...store.tasks, ...store.categories, ...store.task_completions, ...store.user_preferences]) {
      expect(row.user_id).toBe("demo-user-ved-patel");
    }
  });

  it("produces completed tasks matching completion events exactly", () => {
    const store = createDemoWorkspace(anchor);
    const completedTasks = store.tasks.filter((t) => t.status === "Completed");
    // Each completed task has a matching completion event
    for (const task of completedTasks) {
      expect(task.completed_at).toBeTruthy();
      const event = store.task_completions.find((c) => c.task_id === task.id);
      expect(event, `Completed task "${task.title}" has no completion event`).toBeTruthy();
      expect(event!.completed_at).toBe(task.completed_at);
    }
    // No orphan completions (each completion's task is "Completed")
    for (const event of store.task_completions) {
      const task = store.tasks.find((t) => t.id === event.task_id);
      expect(task?.status).toBe("Completed");
    }
  });

  it("never generates completed_at timestamps in the future", () => {
    const store = createDemoWorkspace(anchor);
    const anchorMs = anchor.getTime();
    for (const task of store.tasks) {
      if (task.completed_at) {
        expect(Date.parse(task.completed_at)).toBeLessThanOrEqual(anchorMs);
      }
    }
    for (const event of store.task_completions) {
      expect(Date.parse(event.completed_at)).toBeLessThanOrEqual(anchorMs);
    }
  });

  it("produces tasks with non-overlapping scheduled intervals", () => {
    const store = createDemoWorkspace(anchor);
    const scheduled = store.tasks.filter((t) => t.scheduled_start && t.status !== "Completed");
    for (let i = 0; i < scheduled.length; i++) {
      for (let j = i + 1; j < scheduled.length; j++) {
        const a = bookedInterval(scheduled[i]);
        const b = bookedInterval(scheduled[j]);
        if (a && b) {
          expect(
            overlaps(a, b),
            `"${scheduled[i].title}" overlaps "${scheduled[j].title}"`,
          ).toBe(false);
        }
      }
    }
  });

  it("produces tasks that are disjoint across Completed, Pending, and Overdue", () => {
    const store = createDemoWorkspace(anchor);
    const completedCount = store.tasks.filter((t) => statusAt(t, anchor) === "Completed").length;
    const pendingCount = store.tasks.filter((t) => statusAt(t, anchor) === "Pending").length;
    const overdueCount = store.tasks.filter((t) => statusAt(t, anchor) === "Overdue").length;
    expect(completedCount + pendingCount + overdueCount).toBe(store.tasks.length);
  });

  it("generates meaningful metrics compatible with the domain functions", () => {
    const store = createDemoWorkspace(anchor);
    const m = metrics(store.tasks, store.task_completions, anchor);
    // Open tasks count
    const completed = store.tasks.filter((t) => t.status === "Completed").length;
    expect(m.open).toBe(store.tasks.length - completed);
    expect(m.completed).toBe(completed);
    // Completion rate
    expect(m.completionRate).toBe(completed / store.tasks.length);
    // Due today should be non-negative
    expect(m.dueToday.length).toBeGreaterThanOrEqual(0);
    // Week should have 7 entries
    expect(m.week).toHaveLength(7);
    // Some day should have completions (populated chart)
    expect(m.week.some((d) => d.completed > 0)).toBe(true);
    // Streak should match the expected computation
    expect(m.streak).toBe(computeExpectedStreak(anchor));
    expect(m.streak).toBeGreaterThan(0);
  });

  it("generates recommendations based on actual task data", () => {
    const store = createDemoWorkspace(anchor);
    const tips = recommendations(store.tasks, store.user_preferences[0], anchor);
    // Should have at least one recommendation (overdue or critical or unscheduled)
    expect(tips.length).toBeGreaterThan(0);
  });

  it("produces scheduled tasks today and backlog tasks for the planner", () => {
    const store = createDemoWorkspace(anchor);
    const today = calendarDay(anchor);
    const { scheduled, backlog } = plannerLists(store.tasks, today);
    // Should have scheduled work today
    expect(scheduled.length).toBeGreaterThan(0);
    // Should have backlog tasks
    expect(backlog.length).toBeGreaterThan(0);
  });

  it("passes Zod schema validation on all records", () => {
    const store = createDemoWorkspace(anchor);
    for (const task of store.tasks) {
      expect(taskSchema.safeParse(task).success, `Task "${task.title}" fails schema`).toBe(true);
    }
    for (const cat of store.categories) {
      expect(categorySchema.safeParse(cat).success, `Category "${cat.name}" fails schema`).toBe(true);
    }
    for (const c of store.task_completions) {
      expect(completionSchema.safeParse(c).success, `Completion ${c.id} fails schema`).toBe(true);
    }
    for (const p of store.user_preferences) {
      expect(preferencesSchema.safeParse(p).success).toBe(true);
    }
  });

  it("is deterministic when given the same anchor", () => {
    const a = createDemoWorkspace(anchor);
    const b = createDemoWorkspace(anchor);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("adapts to late-night anchors without future completions", () => {
    // 11 PM on a Thursday
    const lateNight = new Date("2026-11-19T17:30:00.000Z"); // Thu 23:00 IST
    const store = createDemoWorkspace(lateNight);
    const lateMs = lateNight.getTime();
    for (const event of store.task_completions) {
      expect(Date.parse(event.completed_at)).toBeLessThanOrEqual(lateMs);
    }
    // Should still produce a valid workspace
    expect(store.tasks.length).toBeGreaterThan(20);
    expect(store.task_completions.length).toBeGreaterThan(10);
  });

  it("adapts to early-morning anchors", () => {
    // 6 AM on a Thursday
    const earlyMorning = new Date("2026-11-19T00:30:00.000Z"); // Thu 06:00 IST
    const store = createDemoWorkspace(earlyMorning);
    const earlyMs = earlyMorning.getTime();
    for (const event of store.task_completions) {
      expect(Date.parse(event.completed_at)).toBeLessThanOrEqual(earlyMs);
    }
    // No completions today (too early), but previous days should have data
    const today = calendarDay(earlyMorning);
    const todayCompletions = store.task_completions.filter((c) => c.completion_date === today);
    expect(todayCompletions.length).toBe(0);
  });

  it("adapts to weekend anchors", () => {
    // Saturday 10 AM IST
    const weekend = new Date("2026-11-21T04:30:00.000Z");
    const store = createDemoWorkspace(weekend);
    expect(store.tasks.length).toBeGreaterThan(20);
    // Should still have some completions
    expect(store.task_completions.length).toBeGreaterThan(10);
    // All completions in the past
    for (const event of store.task_completions) {
      expect(Date.parse(event.completed_at)).toBeLessThanOrEqual(weekend.getTime());
    }
  });

  it("includes a recurring series", () => {
    const store = createDemoWorkspace(anchor);
    const seriesTasks = store.tasks.filter((t) => t.series_id);
    expect(seriesTasks.length).toBeGreaterThanOrEqual(2);
    // All share the same series_id
    const seriesIds = new Set(seriesTasks.map((t) => t.series_id));
    expect(seriesIds.size).toBe(1);
    // Occurrence indices are distinct
    const indices = seriesTasks.map((t) => t.occurrence_index);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("produces 6 categories with valid colors", () => {
    const store = createDemoWorkspace(anchor);
    expect(store.categories).toHaveLength(6);
    for (const cat of store.categories) {
      expect(cat.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(cat.name.length).toBeGreaterThan(0);
    }
  });
});
