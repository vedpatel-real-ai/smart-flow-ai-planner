import { expect, it } from "vitest";
import { changedFields } from "../../src/domain/taskEdits";
import type { Task } from "../../src/types/database";

const old: Task = {
  id: "1",
  user_id: "u",
  title: "Draft",
  priority_level: "High",
  is_recurring: true,
  status: "Pending",
  ai_priority_score: 7,
  created_at: "2026-01-01T09:00Z",
  updated_at: "2026-01-01T09:00Z",
};

it("sends only edited metadata so other occurrences retain their exceptions", () => {
  expect(changedFields(old, { title: "Review", priority_level: "High", tags: [], category_id: null }))
    .toEqual({ title: "Review" });
});
it("preserves explicit clears of existing values but does not rewrite unchanged instants", () => {
  const due = "2026-11-01T06:30:41.123Z";
  const task = { ...old, due_date: due, scheduled_start: due, tags: ["team"] };
  expect(changedFields(task, { scheduled_start: null, tags: [], due_date: due })).toEqual({
    scheduled_start: null,
    tags: [],
  });
});
