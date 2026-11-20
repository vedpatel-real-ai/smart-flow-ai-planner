import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";
import type { Category, Task, TaskCompletion, UserPreferences } from "../types/database";
import {
  categorySchema,
  completionSchema,
  createPayload,
  editableChanges,
  type PlannerService,
  preferencesSchema,
  presentSnapshot,
  SavedRankingError,
  type Scope,
  taskSchema,
} from "./contract";

interface Result<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}
function result<T>(response: Result<T>): T {
  if (response.error) {
    if (response.error.code === "23P01") throw new Error("This placement overlaps another task.");
    throw new Error(response.error.message);
  }
  if (response.data === null) throw new Error("The requested record is no longer available.");
  return response.data;
}

async function allRows<Row extends { id: string }>(page: (after: string) => PromiseLike<Result<Row[]>>) {
  const rows: Row[] = [];
  let cursor = "";
  for (;;) {
    const batch = result(await page(cursor));
    if (!batch.length) return rows;
    const next = batch[batch.length - 1].id;
    if (next <= cursor) throw new Error("Could not read the next page.");
    rows.push(...batch);
    cursor = next;
  }
}

export function cloudService(db: SupabaseClient<Database>, owner: string): PlannerService {
  let lastRefresh: Promise<void> = Promise.resolve();
  // A later write must trigger a read after any already-running rank calculation.
  function refreshScores() {
    const next = lastRefresh.then(recalculate);
    lastRefresh = next.catch(() => {/* The initiating caller receives the error. */});
    return next;
  }
  async function recalculate() {
    const { data: { session }, error: authError } = await db.auth.getSession();
    if (authError || !session || session.user.id !== owner) throw new Error("The workspace session changed.");
    const invoke = () =>
      db.functions.invoke<{ inspected: number; updated: number }>("task-priority", {
        body: {},
        headers: { Authorization: "Bearer " + session.access_token },
        timeout: 15000,
      });
    let response = await invoke();
    if (response.error?.context instanceof Response && response.error.context.status === 409) {
      response = await invoke();
    }
    const { data, error } = response;
    if (error || !data || !Number.isInteger(data.updated) || !Number.isInteger(data.inspected)) {
      throw new Error("Could not refresh ranking. Please try again.");
    }
  }
  async function rankAfterSave() {
    try {
      await refreshScores();
    } catch {
      throw new SavedRankingError();
    }
  }
  async function selection(id: string, scope: Scope): Promise<["id" | "series_id", string]> {
    if (scope === "one") return ["id", id];
    const target = result(
      await db.from("tasks").select("series_id").eq("user_id", owner).eq("id", id).single(),
    );
    if (!target.series_id) throw new Error("This task does not belong to a series.");
    return ["series_id", target.series_id];
  }
  return {
    async snapshot() {
      const [tasks, categories, completions, preferences] = await Promise.all([
        allRows((after) => {
          const page = db.from("tasks").select("*").eq("user_id", owner).order("id").limit(250);
          return after ? page.gt("id", after) : page;
        }),
        allRows((after) => {
          const page = db.from("categories").select("*").eq("user_id", owner).order("id").limit(250);
          return after ? page.gt("id", after) : page;
        }),
        allRows((after) => {
          const page = db.from("task_completions").select("*").eq("user_id", owner).order("id").limit(250);
          return after ? page.gt("id", after) : page;
        }),
        db.from("user_preferences").select("*").eq("user_id", owner).single(),
      ]);
      return presentSnapshot({
        tasks: taskSchema.array().parse(tasks) as Task[],
        categories: categorySchema.array().parse(categories) as Category[],
        completions: completionSchema.array().parse(completions) as TaskCompletion[],
        preferences: preferencesSchema.parse(result(preferences)) as UserPreferences,
      });
    },
    async create(rows) {
      const payload = createPayload(rows, owner);
      const ids = result(await db.rpc("create_task_batch", { p_tasks: payload }));
      if (ids.length !== rows.length || !rows.every((row) => ids.includes(row.id))) {
        throw new Error("Could not confirm task creation.");
      }
      await rankAfterSave();
    },
    async update(id, changes, scope = "one") {
      const patch = editableChanges(changes, scope);
      const [field, value] = await selection(id, scope);
      const rows = result(
        await db.from("tasks").update(patch).eq("user_id", owner).eq(field, value).select("id"),
      );
      if (!rows.length) throw new Error("This task is no longer available.");
      if (["priority_level", "estimated_duration", "due_date"].some((key) => key in patch)) {
        await rankAfterSave();
      }
    },
    async remove(id, scope = "one") {
      const [field, value] = await selection(id, scope);
      const rows = result(await db.from("tasks").delete().eq("user_id", owner).eq(field, value).select("id"));
      if (!rows.length) throw new Error("This task is no longer available.");
    },
    async complete(id) {
      const completed = result(await db.rpc("complete_task", { p_task_id: id }));
      if (completed !== id) throw new Error("Could not confirm completion.");
    },
    refreshScores,
    async setSuggestions(enabled) {
      result(
        await db.from("user_preferences").update({ ai_suggestions_enabled: enabled }).eq("user_id", owner)
          .select("id").single(),
      );
    },
  };
}
