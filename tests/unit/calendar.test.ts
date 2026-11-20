import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bookedInterval,
  calendarDay,
  dateBounds,
  inputInstant,
  localInput,
  occurrences,
  overlaps,
  plannerLists,
} from "../../src/domain/calendar";
import type { Task } from "../../src/types/database";

const originalZone = process.env.TZ;
afterEach(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});
beforeEach(() => {
  process.env.TZ = "UTC";
});

describe("wall time and persisted instants", () => {
  it.each([
    ["Asia/Kolkata", "2030-09-18T00:00", "2030-09-17T18:30:00.000Z"],
    ["UTC", "2030-09-18T00:00", "2030-09-18T00:00:00.000Z"],
    ["America/New_York", "2030-09-18T00:00", "2030-09-18T04:00:00.000Z"],
  ])("creates and reopens a local midnight in %s", (zone, input, expected) => {
    process.env.TZ = zone;
    expect(inputInstant(input)).toBe(expected);
    expect(localInput(expected)).toBe(input);
    expect(calendarDay(new Date(expected))).toBe("2030-09-18");
  });
  it("preserves precision and the second occurrence of a repeated fall hour", () => {
    process.env.TZ = "America/New_York";
    const second = "2026-11-01T06:30:41.123Z";
    expect(localInput(second)).toBe("2026-11-01T01:30");
    expect(inputInstant(localInput(second), second)).toBe(second);
    expect(inputInstant("2026-11-01T01:30")).toBe("2026-11-01T05:30:00.000Z");
  });
  it("rejects skipped and impossible local dates", () => {
    process.env.TZ = "America/New_York";
    expect(() => inputInstant("2026-03-08T02:30")).toThrow("valid local time");
    expect(() => inputInstant("2026-02-30T10:15")).toThrow("valid local time");
    expect(inputInstant("")).toBeNull();
  });
  it.each([["2026-03-08", 23], ["2026-11-01", 25]])("uses the actual length of %s", (day, hours) => {
    process.env.TZ = "America/New_York";
    const [start, end] = dateBounds(String(day));
    expect((end - start) / 3_600_000).toBe(hours);
  });
});

describe("bounded recurrence", () => {
  it.each(
    [
      ["Daily", 1, "2026-02-01"],
      ["Daily", 2, "2026-02-02"],
      ["Weekly", 1, "2026-02-07"],
      ["Weekly", 2, "2026-02-14"],
    ] as const,
  )("applies %s interval %i", (unit, interval, date) => {
    expect(occurrences("2026-01-31T10:00:00.000Z", unit, interval, 2)[1]).toBe(date + "T10:00:00.000Z");
  });
  it.each([[2026, 28], [2028, 29]])(
    "clamps month end and restores the original day in %i",
    (year, february) => {
      const dates = occurrences(year + "-01-31T10:00:00.000Z", "Monthly", 1, 5).map((date) =>
        date.slice(5, 10)
      );
      expect(dates).toEqual(["01-31", "02-" + february, "03-31", "04-30", "05-31"]);
    },
  );
  it("moves a skipped occurrence forward but restores its original wall time the next day", () => {
    process.env.TZ = "America/New_York";
    const starts = occurrences("2026-03-07T07:30:00Z", "Daily", 1, 3).map(localInput);
    expect(starts).toEqual(["2026-03-07T02:30", "2026-03-08T03:30", "2026-03-09T02:30"]);
  });
  it("rejects unsupported rules and unbounded counts", () => {
    const first = "2026-01-31T10:00:00Z";
    expect(() => occurrences(first, "Custom", 1, 3)).toThrow("Choose Daily");
    expect(() => occurrences(first, "Weekly", 0, 3)).toThrow("interval");
    expect(() => occurrences(first, "Monthly", 1, 31)).toThrow("30 occurrences");
  });
});

describe("planner intervals", () => {
  const task = (id: string, data: Partial<Task> = {}): Task => ({
    id,
    user_id: "user",
    title: id,
    status: "Pending",
    priority_level: "Medium",
    is_recurring: false,
    ai_priority_score: 0,
    created_at: "2026-01-01T00:00Z",
    updated_at: "2026-01-01T00:00Z",
    ...data,
  });
  it("includes active overnight intervals and global backlog independently of deadlines", () => {
    const list = plannerLists([
      task("overnight", { scheduled_start: "2026-06-07T23:30Z", estimated_duration: 90 }),
      task("ends at midnight", { scheduled_start: "2026-06-07T23:30Z" }),
      task("late", { scheduled_start: "2026-06-08T22:00Z" }),
      task("undated"),
      task("deadline tomorrow", { due_date: "2026-06-09T12:00Z" }),
      task("finished", { status: "Completed" }),
    ], "2026-06-08");
    expect(list.scheduled.map((t) => t.id)).toEqual(["overnight", "late"]);
    expect(list.backlog.map((t) => t.id)).toEqual(["undated", "deadline tomorrow"]);
  });
  it("reserves the full duration, permits adjacent work, and frees completed tasks", () => {
    const interval = bookedInterval(
      task("long", { scheduled_start: "2026-06-08T12:00Z", estimated_duration: 120 }),
    )!;
    const [start, end] = interval;
    expect(end - start).toBe(7_200_000);
    expect(overlaps(interval, [end - 1, end + 50])).toBe(true);
    expect(overlaps(interval, [end, end + 50])).toBe(false);
    expect(
      bookedInterval(task("finished", { status: "Completed", scheduled_start: "2026-06-08T12:00Z" })),
    ).toBeNull();
  });
});
