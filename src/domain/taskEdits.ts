import type { Task } from "../types/database";

type EditableTask = Pick<
  Task,
  | "title"
  | "description"
  | "category_id"
  | "tags"
  | "priority_level"
  | "estimated_duration"
  | "due_date"
  | "scheduled_start"
>;

/** Patching only edited fields preserves unrelated changes and single-occurrence exceptions. */
export function changedFields(original: Task, values: Partial<EditableTask>): Partial<EditableTask> {
  return Object.fromEntries(
    Object.entries(values).filter(([field, value]) => {
      const previous = original[field as keyof EditableTask];
      if (field === "tags" && Array.isArray(value)) {
        const saved = original.tags ?? [];
        return saved.length !== value.length || saved.some((tag, index) => tag !== value[index]);
      }
      return (value ?? null) !== (previous ?? null);
    }),
  );
}
