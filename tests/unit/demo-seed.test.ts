import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoWorkspace } from "../../src/demo/fixtures";
import { metrics, recommendations, statusAt } from "../../src/domain/metrics";
import { bookedInterval, overlaps, calendarDay, plannerLists } from "../../src/domain/calendar";
import {
  taskSchema,
  categorySchema,
  completionSchema,
  preferencesSchema,
} from "../../src/providers/contract";

describe("Demo fixture generator", () => {
  const anchor = new Date(2026, 10, 19, 10);

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
    expect(m.streak).toBe(10);
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

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  describe.each(["UTC", "Asia/Kolkata", "America/New_York"])("%s local calendar", (zone) => {
    it.each([
      "2026-03-08T00:00", "2026-03-08T06:00", "2026-10-31T10:00",
      "2026-11-01T15:00", "2026-11-30T23:59:30", "2026-03-09T00:00",
    ])("seeds exact counts and valid dates at %s", (time) => {
      vi.stubEnv("TZ", zone);
      const now = new Date(time);
      vi.useFakeTimers().setSystemTime(now);
      const { tasks, task_completions: events } = createDemoWorkspace();
      const summary = metrics(tasks, events, now);
      expect(tasks).toHaveLength(48);
      expect(summary).toMatchObject({ open: 28, completed: 20, completionRate: 20 / 48 });
      expect(events).toHaveLength(20);
      expect(new Set(events.map(e => e.task_id)).size).toBe(20);
      expect(tasks.filter(t => statusAt(t, now) === "Overdue")).toHaveLength(2);
      const openDue = summary.dueToday.filter(t => t.status !== "Completed");
      expect(openDue).toHaveLength(now.getHours() === 23 ? 0 : 4);
      expect(summary.completedToday).toBe(Number(now.getHours() >= 10) + Number(now.getHours() >= 11));
      expect(summary.week[0].date.getDay()).toBe(1);
      expect(summary.week[6].date.getDay()).toBe(0);
      expect(plannerLists(tasks, calendarDay(now)).backlog).toHaveLength(3);
      const series = tasks.filter(t => t.series_id);
      expect(series.map(t => t.occurrence_index)).toEqual([0, 1, 2, 3, 4]);
      for (const [i, task] of series.entries()) {
        const expected = new Date(series[0].scheduled_start!);
        expected.setDate(expected.getDate() + 7 * i);
        expect(task.scheduled_start).toBe(expected.toISOString());
      }
      const intervals = tasks.map(bookedInterval).filter(i => i !== null).sort((a, b) => a[0] - b[0]);
      expect(intervals).toHaveLength(25);
      intervals.forEach(([start, end], i) => {
        expect(start).toBeLessThan(end);
        if (i) expect(start).toBeGreaterThanOrEqual(intervals[i - 1][1]);
      });
      for (const task of tasks) {
        expect(Date.parse(task.created_at)).toBeLessThanOrEqual(Date.parse(task.updated_at));
        expect(Date.parse(task.updated_at)).toBeLessThanOrEqual(+now);
      }
      for (const event of events) {
        const task = tasks.find(t => t.id === event.task_id)!;
        expect(task.completed_at).toBe(event.completed_at);
        expect(Date.parse(task.created_at)).toBeLessThanOrEqual(Date.parse(event.completed_at));
        expect(event.completion_date).toBe(calendarDay(new Date(event.completed_at)));
      }
    });
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
