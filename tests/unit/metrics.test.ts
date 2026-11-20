import { expect, it } from "vitest";
import { metrics, recommendations, statusAt } from "../../src/domain/metrics";
import type { Task, TaskCompletion, UserPreferences } from "../../src/types/database";

const sunday = new Date(2026, 5, 7, 10);
const when = (day: number, hour = 8) => new Date(2026, 5, day, hour).toISOString();
const prefs: UserPreferences = {
  id: "p",
  user_id: "u",
  daily_task_limit: 1,
  ai_suggestions_enabled: true,
  preferred_work_hours: { start: "09:00", end: "17:00" },
  created_at: when(1),
  updated_at: when(1),
};
function task(id: string, changes: Partial<Task> = {}): Task {
  return {
    id,
    user_id: "u",
    title: id,
    priority_level: "Medium",
    status: "Pending",
    is_recurring: false,
    ai_priority_score: 0,
    created_at: when(1),
    updated_at: when(1),
    ...changes,
  };
}
function event(id: string, day: number, duration: number | null): TaskCompletion {
  return {
    id,
    user_id: "u",
    task_id: id,
    completed_at: when(day),
    completion_date: when(day).slice(0, 10),
    actual_duration: duration,
  };
}

it("keeps an empty workspace free of inferred trends", () => {
  const result = metrics([], [], sunday);
  expect(result).toMatchObject({
    open: 0,
    completed: 0,
    streak: 0,
    averageDuration: null,
    completionRate: null,
  });
  expect(result.week.map((day) => day.completed)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(recommendations([], prefs, sunday)).toEqual([]);
});
it("includes Sunday in the current week and counts distinct calendar days for streaks", () => {
  const events = [event("a", 5, 60), event("b", 6, null), event("c", 7, 0), event("d", 7, 30)];
  const result = metrics([], events, sunday);
  expect(result.completedToday).toBe(2);
  expect(result.week.map((day) => day.completed)).toEqual([0, 0, 0, 0, 1, 1, 2]);
  expect(result.averageDuration).toBe(30);
  expect(result.streak).toBe(3);
  expect(metrics([], events.filter((e) => e.task_id !== "a"), sunday).streak).toBe(2);
  expect(metrics([], [event("a", 5, 60), event("b", 6, null)], sunday).streak).toBe(2);
});
it("separates deadlines, current status and historical event cohorts", () => {
  const tasks = [
    task("today", { due_date: when(7) }),
    task("other", { due_date: when(8) }),
    task("completed", { status: "Completed", due_date: when(7) }),
  ];
  expect(metrics(tasks, [event("completed", 6, null)], sunday)).toMatchObject({
    open: 2,
    completed: 1,
    completedToday: 0,
    completionRate: 1 / 3,
  });
  expect(metrics(tasks, [], sunday).dueToday.map((t) => t.id)).toEqual(["today", "completed"]);
  expect(statusAt(tasks[0], sunday)).toBe("Overdue");
  expect(statusAt(task("legacy", { status: "Overdue", due_date: when(8) }), sunday)).toBe("Pending");
  expect(metrics(tasks.filter((t) => t.id !== "completed"), [], sunday).completionRate).toBe(0);
});
it("produces only enabled rules whose conditions hold and counts scheduled open work", () => {
  const tasks = [
    task("late", { due_date: when(6), priority_level: "Critical" }),
    task("planned", { scheduled_start: when(7) }),
    task("also planned", { scheduled_start: when(7, 12) }),
    task("already completed", { status: "Completed", priority_level: "Critical" }),
  ];
  expect(recommendations(tasks, prefs, sunday)).toEqual([
    expect.stringMatching(/^1 open task is past/),
    expect.stringMatching(/^1 open task has critical/),
    expect.stringMatching(/^1 open task has no planned/),
    expect.stringMatching(/planned 2 tasks today/),
  ]);
  expect(recommendations(tasks, { ...prefs, ai_suggestions_enabled: false }, sunday)).toEqual([]);
  expect(recommendations(tasks.slice(1), prefs, sunday)).toHaveLength(1);
});

it.each(
  [
    ["Asia/Kolkata", 2, 0, 2],
    ["UTC", 0, 2, 0],
    ["America/New_York", 0, 2, 0],
  ] as const,
)("buckets the same instants into local calendar days in %s", (zone, today, saturday, sundayCount) => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = zone;
    const first = { ...event("a", 1, null), completed_at: "2026-06-06T20:30:00Z" };
    const second = { ...event("b", 1, null), completed_at: "2026-06-06T23:30:00Z" };
    const result = metrics([], [first, second], new Date("2026-06-07T13:00:00Z"));
    expect(result.completedToday).toBe(today);
    expect(result.week[5].completed).toBe(saturday);
    expect(result.week[6].completed).toBe(sundayCount);
    expect(result.streak).toBe(1);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
