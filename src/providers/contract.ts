import type { Category, Task, TaskCompletion, UserPreferences } from "../types/database";
import { z } from "zod";

export interface WorkspaceSnapshot {
  tasks: Task[];
  categories: Category[];
  completions: TaskCompletion[];
  preferences: UserPreferences;
}
export type Scope = "one" | "series";
export interface PlannerService {
  snapshot(): Promise<WorkspaceSnapshot>;
  create(rows: Task[]): Promise<void>;
  update(id: string, changes: Partial<Task>, scope?: Scope): Promise<void>;
  remove(id: string, scope?: Scope): Promise<void>;
  complete(id: string): Promise<void>;
  refreshScores(): Promise<void>;
  setSuggestions(enabled: boolean): Promise<void>;
}

export class SavedRankingError extends Error {
  constructor() {
    super("Your changes were saved. Refresh ranking to update the scores.");
  }
}

const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp");
const identity = z.object({ id: z.string().min(1), user_id: z.string().min(1) });
export const taskSchema = identity.extend({
  title: z.string(),
  description: z.string().nullish(),
  due_date: timestamp.nullish(),
  scheduled_start: timestamp.nullish(),
  series_id: z.string().nullish(),
  occurrence_index: z.number().int().nullish(),
  priority_level: z.enum(["Low", "Medium", "High", "Critical"]).nullable().transform((v) => v ?? "Medium"),
  category_id: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  is_recurring: z.boolean().nullable().transform((v) => v ?? false),
  recurrence_type: z.enum(["Daily", "Weekly", "Monthly", "Custom"]).nullish(),
  recurrence_interval: z.number().int().nullish(),
  estimated_duration: z.number().int().nullish(),
  status: z.enum(["Pending", "Overdue", "Completed"]).nullable().transform((v) => v ?? "Pending"),
  completed_at: timestamp.nullish(),
  ai_priority_score: z.number().nullable().transform((v) => v ?? 0),
  parent_task_id: z.string().nullish(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const categorySchema = identity.extend({
  name: z.string(),
  color: z.string().nullable().transform((v) => v ?? "#3B82F6"),
  created_at: timestamp,
});
export const completionSchema = identity.extend({
  task_id: z.string(),
  completed_at: timestamp,
  completion_date: z.string(),
  actual_duration: z.number().nullish(),
});
export const preferencesSchema = identity.extend({
  preferred_work_hours: z.object({ start: z.string(), end: z.string() }).nullable().transform((v) =>
    v ?? { start: "09:00", end: "17:00" }
  ),
  ai_suggestions_enabled: z.boolean().nullable().transform((v) => v ?? true),
  daily_task_limit: z.number().int().nullable().transform((v) => v ?? 8),
  created_at: timestamp,
  updated_at: timestamp,
});

const commonFields = [
  "title",
  "description",
  "priority_level",
  "estimated_duration",
  "category_id",
  "tags",
] as const;
const occurrenceFields = [...commonFields, "due_date", "scheduled_start"] as const;
export function editableChanges(
  changes: Partial<Task>,
  scope: Scope,
): Partial<Pick<Task, typeof occurrenceFields[number]>> {
  const allowed = new Set<string>(scope === "series" ? commonFields : occurrenceFields);
  if (!Object.keys(changes).length || Object.keys(changes).some((k) => !allowed.has(k))) {
    throw new Error("Unsupported change for this selection.");
  }
  validateFields(changes);
  return changes;
}

function validateFields(task: Partial<Task>) {
  if ("title" in task && !task.title?.trim()) throw new Error("Enter a task title.");
  if (
    task.estimated_duration != null &&
    (!Number.isInteger(task.estimated_duration) || task.estimated_duration < 1 ||
      task.estimated_duration > 1440)
  ) {
    throw new Error("Duration must be 1 to 1440 minutes.");
  }
  if (
    task.recurrence_interval != null &&
    (!Number.isInteger(task.recurrence_interval) || task.recurrence_interval < 1 ||
      task.recurrence_interval > 365)
  ) {
    throw new Error("Recurrence interval must be 1 to 365.");
  }
  for (const date of [task.due_date, task.scheduled_start]) {
    if (date != null && !Number.isFinite(Date.parse(date))) throw new Error("Invalid task date.");
  }
}

export function createPayload(rows: Task[], userId: string) {
  if (!rows.length || rows.length > 100 || new Set(rows.map((r) => r.id)).size !== rows.length) {
    throw new Error("A batch needs 1 to 100 distinct task IDs.");
  }
  return rows.map((task) => {
    if (
      task.user_id !== userId || !z.string().uuid().safeParse(task.id).success || task.status !== "Pending"
    ) throw new Error("Invalid new task.");
    if (
      (task.series_id == null) !== (task.occurrence_index == null) ||
      (task.series_id && !z.string().uuid().safeParse(task.series_id).success)
    ) {
      throw new Error("Invalid series identity.");
    }
    validateFields(task);
    return {
      id: task.id,
      user_id: userId,
      title: task.title.trim(),
      description: task.description ?? null,
      priority_level: task.priority_level,
      estimated_duration: task.estimated_duration ?? null,
      category_id: task.category_id ?? null,
      tags: task.tags ?? [],
      due_date: task.due_date ?? null,
      scheduled_start: task.scheduled_start ?? null,
      is_recurring: task.is_recurring,
      recurrence_type: task.recurrence_type ?? null,
      recurrence_interval: task.recurrence_interval ?? 1,
      series_id: task.series_id ?? null,
      occurrence_index: task.occurrence_index ?? null,
      parent_task_id: task.parent_task_id ?? null,
    };
  });
}

export function presentSnapshot(data: WorkspaceSnapshot): WorkspaceSnapshot {
  const categories = [...data.categories].sort((a, b) =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );
  const categoryById = new Map(categories.map((row) => [row.id, row]));
  const tasks = data.tasks.map((task) => ({ ...task, category: categoryById.get(task.category_id ?? "") }))
    .sort((a, b) => b.ai_priority_score - a.ai_priority_score || a.id.localeCompare(b.id));
  const completions = [...data.completions].sort((a, b) =>
    b.completed_at.localeCompare(a.completed_at) || a.id.localeCompare(b.id)
  );
  return { ...data, categories, tasks, completions };
}
