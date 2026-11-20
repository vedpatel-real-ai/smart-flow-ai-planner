import { z } from "zod";
import { bookedInterval, overlaps } from "../domain/calendar";
import { createDemoWorkspace } from "../demo/fixtures";
import { demoUserProfile } from "../demo/users";
import type { Category, Task, TaskCompletion, UserPreferences } from "../types/database";
import { scoreTask } from "../../supabase/functions/_shared/scoring";
import {
  categorySchema,
  completionSchema,
  createPayload,
  editableChanges,
  type PlannerService,
  preferencesSchema,
  presentSnapshot,
  type Scope,
  taskSchema,
} from "./contract";

export const demoStoreKey = "smart-taskflow-demo-store";
const owner = demoUserProfile.id;
interface Store {
  version: 2;
  tasks: Task[];
  categories: Category[];
  task_completions: TaskCompletion[];
  user_preferences: UserPreferences[];
  receipts: Record<string, string>;
}
const storedSchema = z.object({
  version: z.literal(2).optional(),
  tasks: z.array(taskSchema),
  categories: z.array(categorySchema),
  task_completions: z.array(completionSchema),
  user_preferences: z.array(preferencesSchema),
  receipts: z.record(z.string()).default({}),
});

function overlap(a: Task, b: Task) {
  const left = bookedInterval(a), right = bookedInterval(b);
  return left && right && overlaps(left, right);
}

function rank(tasks: Task[]) {
  const now = Date.now();
  for (const task of tasks) task.ai_priority_score = task.status === "Completed" ? 0 : scoreTask(task, now);
}

function newEvent(task: Task, now: string): TaskCompletion {
  return {
    id: crypto.randomUUID(),
    task_id: task.id,
    user_id: owner,
    completed_at: now,
    completion_date: now.slice(0, 10),
    actual_duration: null,
  };
}

function upgrade(store: Store) {
  // Old releases used the deadline as a placement. Ambiguous placements stay in the backlog.
  const candidates = store.tasks.map((task) => ({ ...task, scheduled_start: task.due_date ?? null }));
  store.tasks = candidates.map((task) => ({
    ...task,
    scheduled_start: candidates.some((other) => other.id !== task.id && overlap(other, task))
      ? null
      : task.scheduled_start,
  }));
  const events = store.task_completions;
  store.task_completions = store.tasks.filter((task) => task.status === "Completed").map((task) => {
    const event = events.find((item) => item.task_id === task.id);
    if (!event && !task.completed_at) {
      throw new Error(
        "A completed local task is missing its completion time. The original workspace has been preserved.",
      );
    }
    const recorded = event ?? newEvent(task, task.completed_at!);
    task.completed_at = recorded.completed_at;
    return { ...recorded, completion_date: new Date(recorded.completed_at).toISOString().slice(0, 10) };
  });
  rank(store.tasks);
}

function seeded(): Store {
  const store: Store = structuredClone(createDemoWorkspace());
  // Re-rank with live clock so scores reflect the actual current time
  rank(store.tasks);
  return store;
}

function read(storage: Storage): { store: Store; migrated: boolean } {
  const raw = storage.getItem(demoStoreKey);
  if (raw === null) return { store: seeded(), migrated: true };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("This local workspace contains invalid data. Your saved data has been preserved. Use Export to back it up, then Reset Demo to start fresh.");
  }
  const result = storedSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("This local workspace could not be read. Your saved data has been preserved.");
  }
  const store = { ...result.data, version: 2 } as Store;
  if (
    [...store.tasks, ...store.categories, ...store.task_completions, ...store.user_preferences].some((row) =>
      row.user_id !== owner
    ) ||
    store.user_preferences.length !== 1
  ) throw new Error("Invalid local workspace ownership or preferences.");
  if (!result.data.version) upgrade(store);
  return { store, migrated: !result.data.version };
}

type Exclusive = <T>(fn: () => T) => Promise<T>;

const browserLock: Exclusive = async (fn) => {
  if (globalThis.navigator?.locks) {
    return navigator.locks.request(demoStoreKey, fn);
  }
  // Web Locks unavailable (insecure origin or unsupported browser).
  // Fall back to tab-local sequential execution. This does NOT provide
  // cross-tab synchronization — only single-tab crash prevention.
  if (typeof console !== "undefined") {
    console.warn(
      "[DemoProvider] Web Locks unavailable in this environment (insecure origin or unsupported browser). " +
      "Cross-tab coordination is disabled; writes are serialized within this tab only."
    );
  }
  return fn();
};

export async function resetDemo(storage = localStorage, exclusive: Exclusive = browserLock) {
  await exclusive(() => storage.setItem(demoStoreKey, JSON.stringify(seeded())));
}

export function demoService(
  userId: string,
  storage = localStorage,
  exclusive: Exclusive = browserLock,
): PlannerService {
  if (userId !== owner) throw new Error("Select the sample workspace to use Demo Mode.");
  function access<T>(write: boolean, action: (store: Store) => T) {
    return exclusive(() => {
      const { store, migrated } = read(storage);
      const result = action(store);
      if (write || migrated) storage.setItem(demoStoreKey, JSON.stringify(store));
      return result;
    });
  }
  function selection(store: Store, id: string, scope: Scope) {
    const target = store.tasks.find((row) => row.id === id);
    if (!target) throw new Error("This task is no longer available.");
    if (scope === "one") return [target];
    if (!target.series_id) throw new Error("This task does not belong to a series.");
    return store.tasks.filter((row) => row.series_id === target.series_id);
  }
  function validate(store: Store, changed: Task[]) {
    for (const task of changed) {
      if (task.category_id && !store.categories.some((row) => row.id === task.category_id)) {
        throw new Error("Unknown category.");
      }
      if (task.parent_task_id && !store.tasks.some((row) => row.id === task.parent_task_id)) {
        throw new Error("Unknown parent task.");
      }
      if (
        task.series_id != null &&
        (task.occurrence_index == null || task.occurrence_index < 0 ||
          !Number.isInteger(task.occurrence_index))
      ) {
        throw new Error("Invalid occurrence index.");
      }
      if (
        store.tasks.some((other) =>
          other.id !== task.id && task.series_id && other.series_id === task.series_id &&
          other.occurrence_index === task.occurrence_index
        )
      ) throw new Error("Duplicate series occurrence.");
      if (store.tasks.some((other) => other.id !== task.id && overlap(task, other))) {
        throw new Error("This placement overlaps another task.");
      }
    }
  }
  return {
    snapshot: () =>
      access(false, (store) =>
        presentSnapshot({
          tasks: store.tasks,
          categories: store.categories,
          completions: store.task_completions,
          preferences: store.user_preferences[0],
        })),
    async create(rows) {
      const batch = createPayload(rows, owner);
      const canonical = new TextEncoder().encode(JSON.stringify(batch));
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", canonical));
      const fingerprint = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return access(true, (store) => {
        const key = batch[0].id;
        if (store.receipts[key] === fingerprint) return;
        if (
          Object.prototype.hasOwnProperty.call(store.receipts, key) ||
          batch.some((row) => store.tasks.some((task) => task.id === row.id))
        ) throw new Error("Task IDs already exist with different content.");
        const now = new Date().toISOString();
        const tasks: Task[] = batch.map((row) => ({
          ...row,
          user_id: owner,
          created_at: now,
          updated_at: now,
          status: "Pending",
          ai_priority_score: 0,
        }));
        store.tasks.push(...tasks);
        validate(store, tasks);
        store.receipts[key] = fingerprint;
        rank(store.tasks);
      });
    },
    update: (id, changes, scope = "one") =>
      access(true, (store) => {
        const patch = editableChanges(changes, scope);
        const targets = selection(store, id, scope);
        const now = new Date().toISOString();
        for (const task of targets) Object.assign(task, patch, { updated_at: now });
        validate(store, targets);
        rank(store.tasks);
      }),
    remove: (id, scope = "one") =>
      access(true, (store) => {
        const removed = new Set(selection(store, id, scope).map((row) => row.id));
        const children = new Map<string, string[]>();
        for (const task of store.tasks) {
          if (task.parent_task_id) {
            children.set(task.parent_task_id, [...(children.get(task.parent_task_id) ?? []), task.id]);
          }
        }
        for (const parent of removed) {
          for (const child of children.get(parent) ?? []) removed.add(child);
        }
        store.tasks = store.tasks.filter((row) => !removed.has(row.id));
        store.task_completions = store.task_completions.filter((row) => !removed.has(row.task_id));
      }),
    complete: (id) =>
      access(true, (store) => {
        const [task] = selection(store, id, "one");
        if (task.status === "Completed") return;
        const now = new Date().toISOString();
        store.task_completions.push(newEvent(task, now));
        Object.assign(task, {
          status: "Completed",
          updated_at: now,
          completed_at: now,
          ai_priority_score: 0,
        });
      }),
    refreshScores: () => access(true, (store) => rank(store.tasks)),
    setSuggestions: (enabled) =>
      access(true, (store) => {
        store.user_preferences[0].ai_suggestions_enabled = enabled;
        store.user_preferences[0].updated_at = new Date().toISOString();
      }),
  };
}
