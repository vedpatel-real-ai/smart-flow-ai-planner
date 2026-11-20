import type { Task, TaskCompletion, UserPreferences } from "../types/database";
import { calendarDay } from "./calendar";

export function statusAt(task: Task, now: Date) {
  if (task.status === "Completed") return "Completed";
  return task.due_date && Date.parse(task.due_date) < now.getTime() ? "Overdue" : "Pending";
}

export function metrics(tasks: Task[], events: TaskCompletion[], now: Date) {
  const today = calendarDay(now);
  const byDay = new Map<string, number>();
  const durations: number[] = [];
  for (const event of events) {
    const day = calendarDay(new Date(event.completed_at));
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    if (
      typeof event.actual_duration === "number" && Number.isFinite(event.actual_duration) &&
      event.actual_duration >= 0
    ) {
      durations.push(event.actual_duration);
    }
  }
  const cursor = new Date(now);
  if (!byDay.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (byDay.has(calendarDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const monday = new Date(now);
  monday.setDate(now.getDate() - (now.getDay() + 6) % 7);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { date, completed: byDay.get(calendarDay(date)) ?? 0 };
  });
  const dueToday = tasks.filter((task) =>
    task.due_date && calendarDay(new Date(task.due_date)) === today
  );
  const completed = tasks.filter((task) => task.status === "Completed").length;
  return {
    open: tasks.length - completed,
    completed,
    completedToday: byDay.get(today) ?? 0,
    dueToday,
    week,
    streak,
    averageDuration: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    completionRate: tasks.length ? completed / tasks.length : null,
  };
}

export function recommendations(tasks: Task[], prefs: UserPreferences, now: Date) {
  if (!prefs.ai_suggestions_enabled) return [];
  const open = tasks.filter((task) => task.status !== "Completed");
  const overdue = open.filter((task) => statusAt(task, now) === "Overdue").length;
  const critical = open.filter((task) => task.priority_level === "Critical").length;
  const unscheduled = open.filter((task) => !task.scheduled_start).length;
  const today = calendarDay(now);
  const scheduled =
    open.filter((task) => task.scheduled_start && calendarDay(new Date(task.scheduled_start)) === today)
      .length;
  const tips: string[] = [];
  if (overdue) {
    tips.push(
      `${overdue} open ${
        overdue === 1 ? "task is" : "tasks are"
      } past the deadline. Review the deadline or choose a time to work.`,
    );
  }
  if (critical) {
    tips.push(`${critical} open ${critical === 1 ? "task has" : "tasks have"} critical priority.`);
  }
  if (unscheduled) {
    tips.push(
      `${unscheduled} open ${
        unscheduled === 1 ? "task has" : "tasks have"
      } no planned start. Find time in the daily planner.`,
    );
  }
  if (scheduled > prefs.daily_task_limit) {
    tips.push(`You planned ${scheduled} tasks today. Your daily target is ${prefs.daily_task_limit}.`);
  }
  return tips;
}
