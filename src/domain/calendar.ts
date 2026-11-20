import type { RecurrenceType, Task } from "../types/database";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** All form fields and calendar dates use the browser's time zone. */
export function calendarDay(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localInput(instant?: string | null) {
  if (!instant) return "";
  const date = new Date(instant);
  return `${calendarDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function inputInstant(value: string, original?: string | null): string | null {
  if (!value) return null;
  if (original && localInput(original) === value) return original;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || localInput(date.toISOString()) !== value) {
    throw new Error("Choose a valid local time. This time may be skipped by a clock change.");
  }
  return date.toISOString();
}

export function dateBounds(day: string) {
  const start = new Date(day + "T00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.getTime(), end.getTime()] as const;
}

/** Anchor every occurrence to the original day, including after a shorter month. */
export function occurrences(start: string, frequency: RecurrenceType, interval: number, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 30) {
    throw new Error("Choose 1 to 30 occurrences.");
  }
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
    throw new Error("Choose an interval from 1 to 365.");
  }
  if (frequency === "Custom") throw new Error("Choose Daily, Weekly or Monthly.");
  const anchor = new Date(start);
  if (!Number.isFinite(anchor.getTime())) throw new Error("Choose a valid start for the series.");
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return start;
    const next = new Date(anchor);
    if (frequency === "Monthly") {
      next.setDate(1);
      next.setMonth(anchor.getMonth() + index * interval);
      const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(anchor.getDate(), last));
    } else {
      next.setDate(anchor.getDate() + index * interval * (frequency === "Weekly" ? 7 : 1));
    }
    return next.toISOString();
  });
}

export function bookedInterval(task: Pick<Task, "status" | "scheduled_start" | "estimated_duration">) {
  if (task.status === "Completed" || !task.scheduled_start) return null;
  const start = Date.parse(task.scheduled_start);
  return [start, start + (task.estimated_duration ?? 30) * 60_000] as const;
}

export function overlaps(a: readonly [number, number], b: readonly [number, number]) {
  return a[0] < b[1] && b[0] < a[1];
}

export function plannerLists(tasks: Task[], day: string) {
  const bounds = dateBounds(day);
  const backlog = tasks.filter((task) => task.status !== "Completed" && !task.scheduled_start);
  const scheduled = tasks.filter((task) => {
    const interval = bookedInterval(task);
    return interval && overlaps(interval, bounds);
  }).sort((a, b) => Date.parse(a.scheduled_start!) - Date.parse(b.scheduled_start!));
  return { backlog, scheduled };
}
