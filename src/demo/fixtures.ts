/**
 * Deterministic synthetic workspace generator.
 *
 * Produces the complete Demo Mode dataset — tasks, categories, completions,
 * and preferences — from a single anchor timestamp. Every record shares
 * consistent identifiers and relationships.
 *
 * The generator is called once when a fresh browser profile enters Demo Mode.
 * Once stored, the data is never regenerated on subsequent visits.
 */

import type { Category, Task, TaskCompletion, UserPreferences } from "../types/database";
import { scoreTask } from "../../supabase/functions/_shared/scoring";
import { calendarDay } from "../domain/calendar";

const owner = "demo-user-ved-patel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return an ISO timestamp at an offset of `days` from anchor and local hour/minute. */
function isoAt(anchor: Date, days: number, hour: number, minute = 0): string {
  const d = new Date(anchor);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Deterministic pseudo-random ID with a readable prefix. */
function id(prefix: string, index: number): string {
  return `demo-${prefix}-${String(index).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function buildCategories(anchor: Date): Category[] {
  const ts = isoAt(anchor, -30, 9);
  return [
    { id: "demo-cat-product", user_id: owner, name: "Product", color: "#2563eb", created_at: ts },
    { id: "demo-cat-engineering", user_id: owner, name: "Engineering", color: "#16a34a", created_at: ts },
    { id: "demo-cat-design", user_id: owner, name: "Design", color: "#0891b2", created_at: ts },
    { id: "demo-cat-research", user_id: owner, name: "Research", color: "#7c3aed", created_at: ts },
    { id: "demo-cat-meetings", user_id: owner, name: "Meetings", color: "#d97706", created_at: ts },
    { id: "demo-cat-operations", user_id: owner, name: "Operations", color: "#dc2626", created_at: ts },
  ];
}

// ---------------------------------------------------------------------------
// Completion distribution
// ---------------------------------------------------------------------------

/**
 * Returns a list of [dayOffset, hour, minute, durationMinutes] tuples for
 * completed tasks. The distribution is designed to produce:
 *   - A realistic completion streak of consecutive calendar days ending today
 *   - Non-zero entries in the current-week chart
 *   - All timestamps strictly in the past relative to the anchor
 *
 * The function adapts to anchor hour to avoid generating future timestamps.
 */
function completionSlots(anchor: Date): Array<[number, number, number, number]> {
  const hour = anchor.getHours();

  // Completions from previous days — always safe regardless of time of day
  const history: Array<[number, number, number, number]> = [
    // Yesterday (day -1)
    [-1, 9, 30, 35], [-1, 11, 0, 50], [-1, 14, 15, 40],
    // Day -2
    [-2, 10, 0, 45], [-2, 15, 30, 30],
    // Day -3
    [-3, 9, 0, 55], [-3, 11, 30, 25], [-3, 14, 0, 60],
    // Day -4
    [-4, 10, 15, 40], [-4, 13, 45, 35], [-4, 16, 0, 20],
    // Day -5
    [-5, 11, 0, 50],
    // Day -7
    [-7, 9, 30, 45], [-7, 14, 0, 30],
    // Day -8
    [-8, 10, 0, 55], [-8, 15, 0, 35],
    // Day -9
    [-9, 11, 30, 40], [-9, 16, 0, 25],
  ];

  // Completions earlier today — only if anchor hour is late enough
  if (hour >= 11) {
    // Two completions this morning
    history.push([0, 8, 15, 42], [0, 9, 15, 38]);
  } else if (hour >= 10) {
    // One early completion
    history.push([0, 8, 15, 42]);
  }
  // If before 10 AM, no completions today — streak still counts via yesterday

  return history;
}

/**
 * Compute the streak based on the generated completion slots.
 * Mirrors the exact streak algorithm in src/domain/metrics.ts.
 */
function expectedStreak(anchor: Date, slots: Array<[number, number, number, number]>): number {
  const today = calendarDay(anchor);
  const byDay = new Set<string>();
  for (const [dayOffset, h, m] of slots) {
    const d = new Date(anchor);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    byDay.add(calendarDay(d));
  }
  const cursor = new Date(anchor);
  if (!byDay.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (byDay.has(calendarDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

interface TaskDef {
  title: string;
  description: string;
  category: string;
  priority: Task["priority_level"];
  tags: string[];
  durationMin: number;
  /** Day offset from anchor for due_date. null = no deadline. */
  dueDayOffset: number | null;
  dueHour?: number;
  dueMinute?: number;
  /** Day offset for scheduled_start. null = unscheduled. */
  scheduledDayOffset?: number | null;
  scheduledHour?: number;
  scheduledMinute?: number;
  /** Day offset for created_at. */
  createdDayOffset: number;
}

function openTaskDefs(anchor: Date): TaskDef[] {
  const h = anchor.getHours();
  // Due-today tasks need deadlines that are still in the future.
  const futureHour = (offset: number) => Math.min(h + offset, 23);
  const futureMinute = (offset: number) => h + offset > 23 ? 59 : 0;

  return [
    // --- 4 tasks due today (open, due in the future relative to anchor) ---
    {
      title: "Sprint backlog review",
      description: "Prioritize sprint items and identify blockers with the engineering team.",
      category: "demo-cat-meetings", priority: "High", tags: ["sprint", "planning"],
      durationMin: 60, dueDayOffset: 0, dueHour: futureHour(2), dueMinute: futureMinute(2),
      scheduledDayOffset: 0, scheduledHour: 9, scheduledMinute: 30,
      createdDayOffset: -4,
    },
    {
      title: "API error-handling audit",
      description: "Walk through recent error logs and identify unhandled failure modes.",
      category: "demo-cat-engineering", priority: "Medium", tags: ["api", "audit"],
      durationMin: 60, dueDayOffset: 0, dueHour: futureHour(4), dueMinute: futureMinute(4),
      scheduledDayOffset: 0, scheduledHour: 11, scheduledMinute: 0,
      createdDayOffset: -5,
    },
    {
      title: "Release readiness checklist",
      description: "Walk through the checklist for the upcoming production deployment.",
      category: "demo-cat-operations", priority: "Critical", tags: ["release", "ops"],
      durationMin: 90, dueDayOffset: 0, dueHour: futureHour(6), dueMinute: futureMinute(6),
      scheduledDayOffset: 0, scheduledHour: 14, scheduledMinute: 0,
      createdDayOffset: -3,
    },
    {
      title: "Release plan sign-off",
      description: "Review final milestones and confirm the deployment schedule with stakeholders.",
      category: "demo-cat-product", priority: "Critical", tags: ["release", "planning"],
      durationMin: 60, dueDayOffset: 0, dueHour: futureHour(3), dueMinute: futureMinute(3),
      scheduledDayOffset: 0, scheduledHour: 16, scheduledMinute: 0,
      createdDayOffset: -6,
    },

    // --- 2 overdue tasks (due yesterday / day before) ---
    {
      title: "Update API error-handling documentation",
      description: "Document the new retry and circuit-breaker patterns for external integrations.",
      category: "demo-cat-engineering", priority: "Medium", tags: ["docs", "api"],
      durationMin: 50, dueDayOffset: -2, dueHour: 15,
      scheduledDayOffset: -2, scheduledHour: 14, scheduledMinute: 0,
      createdDayOffset: -10,
    },
    {
      title: "Triage customer feedback backlog",
      description: "Review and categorize unprocessed customer feedback from the past sprint.",
      category: "demo-cat-product", priority: "High", tags: ["feedback", "triage"],
      durationMin: 40, dueDayOffset: -1, dueHour: 16,
      scheduledDayOffset: 1, scheduledHour: 14, scheduledMinute: 0,
      createdDayOffset: -8,
    },

    // --- 16 upcoming tasks (due in 1–14 days, scheduled on their respective days) ---
    {
      title: "Resolve authentication regression",
      description: "Investigate and fix the session-restore failure reported in staging.",
      category: "demo-cat-engineering", priority: "High", tags: ["auth", "bug"],
      durationMin: 90, dueDayOffset: 1, dueHour: 17,
      scheduledDayOffset: 1, scheduledHour: 10, scheduledMinute: 0,
      createdDayOffset: -3,
    },
    {
      title: "Update accessibility audit findings",
      description: "Address WCAG contrast and focus-order issues found during the latest review.",
      category: "demo-cat-design", priority: "Medium", tags: ["a11y", "design"],
      durationMin: 45, dueDayOffset: 2, dueHour: 17,
      scheduledDayOffset: 2, scheduledHour: 10, scheduledMinute: 0,
      createdDayOffset: -4,
    },
    {
      title: "Prepare product review presentation",
      description: "Create slides summarizing feature delivery and customer impact metrics.",
      category: "demo-cat-product", priority: "High", tags: ["presentation", "review"],
      durationMin: 75, dueDayOffset: 3, dueHour: 17,
      scheduledDayOffset: 3, scheduledHour: 10, scheduledMinute: 0,
      createdDayOffset: -2,
    },
    {
      title: "Refine analytics dashboard layout",
      description: "Adjust card sizing and chart placement based on user-testing feedback.",
      category: "demo-cat-design", priority: "Medium", tags: ["analytics", "ux"],
      durationMin: 60, dueDayOffset: 3, dueHour: 17,
      scheduledDayOffset: 3, scheduledHour: 14, scheduledMinute: 0,
      createdDayOffset: -4,
    },
    {
      title: "Review user onboarding improvements",
      description: "Evaluate the updated onboarding flow for first-time users.",
      category: "demo-cat-product", priority: "Medium", tags: ["onboarding", "ux"],
      durationMin: 45, dueDayOffset: 4, dueHour: 17,
      scheduledDayOffset: 4, scheduledHour: 10, scheduledMinute: 0,
      createdDayOffset: -6,
    },
    {
      title: "Benchmark database query performance",
      description: "Profile the top-10 slowest queries and propose indexing improvements.",
      category: "demo-cat-engineering", priority: "High", tags: ["database", "perf"],
      durationMin: 120, dueDayOffset: 5, dueHour: 16,
      scheduledDayOffset: 5, scheduledHour: 10, scheduledMinute: 0,
      createdDayOffset: -7,
    },
    {
      title: "Design component library audit",
      description: "Identify inconsistent spacing, typography, and color usage across views.",
      category: "demo-cat-design", priority: "Low", tags: ["design-system"],
      durationMin: 60, dueDayOffset: 5, dueHour: 17,
      scheduledDayOffset: 5, scheduledHour: 14, scheduledMinute: 0,
      createdDayOffset: -3,
    },
    {
      title: "Research competitive scheduling tools",
      description: "Survey three competitor products for calendar-integration approaches.",
      category: "demo-cat-research", priority: "Low", tags: ["competitive", "research"],
      durationMin: 90, dueDayOffset: 6, dueHour: 17,
      scheduledDayOffset: 6, scheduledHour: 10, scheduledMinute: 0,
      createdDayOffset: -5,
    },
    {
      title: "Plan next week's deliverables",
      description: "Break down the roadmap into actionable items for the upcoming week.",
      category: "demo-cat-product", priority: "Medium", tags: ["planning"],
      durationMin: 45, dueDayOffset: 7, dueHour: 17,
      scheduledDayOffset: 7, scheduledHour: 9, scheduledMinute: 30,
      createdDayOffset: -2,
    },
    {
      title: "Integration test suite expansion",
      description: "Add end-to-end test coverage for the new scheduling conflict logic.",
      category: "demo-cat-engineering", priority: "Medium", tags: ["testing", "ci"],
      durationMin: 90, dueDayOffset: 7, dueHour: 17,
      scheduledDayOffset: 7, scheduledHour: 11, scheduledMinute: 0,
      createdDayOffset: -4,
    },
    {
      title: "Mobile responsive polish",
      description: "Fix layout overflow issues on 390px viewport for the planner view.",
      category: "demo-cat-design", priority: "Medium", tags: ["mobile", "responsive"],
      durationMin: 45, dueDayOffset: 8, dueHour: 17,
      scheduledDayOffset: 8, scheduledHour: 14, scheduledMinute: 0,
      createdDayOffset: -6,
    },
    {
      title: "Architecture decision record for caching",
      description: "Document the caching strategy for workspace snapshots.",
      category: "demo-cat-research", priority: "Low", tags: ["adr", "architecture"],
      durationMin: 60, dueDayOffset: 9, dueHour: 17,
      scheduledDayOffset: 9, scheduledHour: 10, scheduledMinute: 0,
      createdDayOffset: -3,
    },
    {
      title: "Stakeholder update email",
      description: "Draft the bi-weekly stakeholder update covering recent milestones.",
      category: "demo-cat-operations", priority: "Medium", tags: ["communication"],
      durationMin: 30, dueDayOffset: 10, dueHour: 17,
      scheduledDayOffset: 10, scheduledHour: 10, scheduledMinute: 0,
      createdDayOffset: -1,
    },
    {
      title: "Review pull requests backlog",
      description: "Clear the pending code review queue and provide actionable feedback.",
      category: "demo-cat-engineering", priority: "High", tags: ["code-review"],
      durationMin: 60, dueDayOffset: 10, dueHour: 17,
      scheduledDayOffset: 10, scheduledHour: 14, scheduledMinute: 0,
      createdDayOffset: -5,
    },
    {
      title: "Update project risk register",
      description: "Reassess open risks and update probability and impact ratings.",
      category: "demo-cat-operations", priority: "Low", tags: ["risk", "governance"],
      durationMin: 30, dueDayOffset: 12, dueHour: 17,
      scheduledDayOffset: 12, scheduledHour: 14, scheduledMinute: 0,
      createdDayOffset: -4,
    },
    {
      title: "Prototype notification preferences UI",
      description: "Build a low-fidelity prototype for per-channel notification settings.",
      category: "demo-cat-design", priority: "Medium", tags: ["prototype", "notifications"],
      durationMin: 90, dueDayOffset: 14, dueHour: 17,
      scheduledDayOffset: 14, scheduledHour: 10, scheduledMinute: 0,
      createdDayOffset: -2,
    },

    // --- 3 backlog tasks (no due date, no scheduled start) ---
    {
      title: "Explore WebSocket reconnection strategies",
      description: "Investigate exponential backoff and jitter for real-time sync.",
      category: "demo-cat-research", priority: "Low", tags: ["websocket", "research"],
      durationMin: 60, dueDayOffset: null, createdDayOffset: -12,
    },
    {
      title: "Write developer onboarding guide",
      description: "Create a step-by-step guide for new team members setting up the project.",
      category: "demo-cat-engineering", priority: "Low", tags: ["docs", "onboarding"],
      durationMin: 90, dueDayOffset: null, createdDayOffset: -11,
    },
    {
      title: "Draft internal retrospective notes",
      description: "Summarize process improvements identified during the last sprint.",
      category: "demo-cat-operations", priority: "Low", tags: ["retro"],
      durationMin: 30, dueDayOffset: null, createdDayOffset: -7,
    },
  ];
}

function completedTaskDefs(): TaskDef[] {
  return [
    {
      title: "Finalize sprint velocity report",
      description: "Calculate delivered story points and update the velocity dashboard.",
      category: "demo-cat-product", priority: "High", tags: ["sprint", "metrics"],
      durationMin: 45, dueDayOffset: -1, dueHour: 12, createdDayOffset: -8,
    },
    {
      title: "Fix date-picker timezone offset",
      description: "Corrected the off-by-one timezone conversion in the calendar input.",
      category: "demo-cat-engineering", priority: "High", tags: ["bug", "timezone"],
      durationMin: 60, dueDayOffset: -1, dueHour: 17, createdDayOffset: -6,
    },
    {
      title: "Review dashboard layout mockups",
      description: "Provided feedback on the revised card grid and responsive breakpoints.",
      category: "demo-cat-design", priority: "Medium", tags: ["review", "layout"],
      durationMin: 35, dueDayOffset: -2, dueHour: 14, createdDayOffset: -9,
    },
    {
      title: "Update deployment runbook",
      description: "Added rollback steps and health-check verification to the runbook.",
      category: "demo-cat-operations", priority: "Medium", tags: ["deployment", "docs"],
      durationMin: 50, dueDayOffset: -2, dueHour: 16, createdDayOffset: -10,
    },
    {
      title: "Conduct user interview analysis",
      description: "Synthesized notes from five user interviews into actionable themes.",
      category: "demo-cat-research", priority: "Medium", tags: ["ux-research"],
      durationMin: 55, dueDayOffset: -3, dueHour: 11, createdDayOffset: -11,
    },
    {
      title: "Set up staging environment",
      description: "Provisioned the staging database and deployed the latest build.",
      category: "demo-cat-engineering", priority: "High", tags: ["staging", "devops"],
      durationMin: 40, dueDayOffset: -3, dueHour: 15, createdDayOffset: -7,
    },
    {
      title: "Sprint planning session",
      description: "Facilitated backlog refinement and committed to next sprint scope.",
      category: "demo-cat-meetings", priority: "High", tags: ["sprint", "planning"],
      durationMin: 60, dueDayOffset: -3, dueHour: 10, createdDayOffset: -5,
    },
    {
      title: "Write API versioning proposal",
      description: "Drafted the RFC for URL-based API versioning with migration guides.",
      category: "demo-cat-engineering", priority: "Medium", tags: ["api", "rfc"],
      durationMin: 25, dueDayOffset: -4, dueHour: 14, createdDayOffset: -12,
    },
    {
      title: "Design token documentation",
      description: "Published the spacing, typography, and color-token reference.",
      category: "demo-cat-design", priority: "Low", tags: ["design-system", "docs"],
      durationMin: 50, dueDayOffset: -4, dueHour: 16, createdDayOffset: -13,
    },
    {
      title: "Review RLS policy coverage",
      description: "Verified row-level security policies cover all public-facing tables.",
      category: "demo-cat-operations", priority: "High", tags: ["rls", "security"],
      durationMin: 40, dueDayOffset: -4, dueHour: 11, createdDayOffset: -8,
    },
    {
      title: "Sunday sprint preparation",
      description: "Reviewed upcoming week priorities and organized task categories.",
      category: "demo-cat-product", priority: "Medium", tags: ["planning"],
      durationMin: 35, dueDayOffset: -5, dueHour: 18, createdDayOffset: -6,
    },
    {
      title: "Archive completed project documentation",
      description: "Moved finished project docs to the archive and updated the index.",
      category: "demo-cat-operations", priority: "Low", tags: ["docs", "archive"],
      durationMin: 20, dueDayOffset: -5, dueHour: 19, createdDayOffset: -9,
    },
    {
      title: "Implement task-filter persistence",
      description: "Save the selected filter state to localStorage so it survives reload.",
      category: "demo-cat-engineering", priority: "Medium", tags: ["feature", "ux"],
      durationMin: 45, dueDayOffset: -7, dueHour: 11, createdDayOffset: -14,
    },
    {
      title: "Optimize bundle with code splitting",
      description: "Configured dynamic imports for the analytics and planner views.",
      category: "demo-cat-engineering", priority: "High", tags: ["perf", "bundler"],
      durationMin: 30, dueDayOffset: -7, dueHour: 16, createdDayOffset: -12,
    },
    {
      title: "Create category color palette",
      description: "Selected accessible colors for all six workspace categories.",
      category: "demo-cat-design", priority: "Medium", tags: ["design", "color"],
      durationMin: 55, dueDayOffset: -8, dueHour: 10, createdDayOffset: -13,
    },
    {
      title: "Database migration for completion tracking",
      description: "Added the task_completions table with foreign keys and indexes.",
      category: "demo-cat-engineering", priority: "High", tags: ["migration", "database"],
      durationMin: 35, dueDayOffset: -8, dueHour: 15, createdDayOffset: -11,
    },
    {
      title: "Draft data-retention policy",
      description: "Outlined retention windows for task history and completion records.",
      category: "demo-cat-research", priority: "Low", tags: ["policy", "data"],
      durationMin: 40, dueDayOffset: -9, dueHour: 14, createdDayOffset: -14,
    },
    {
      title: "Configure CI pipeline caching",
      description: "Added npm and build caching to reduce CI run times by 40%.",
      category: "demo-cat-operations", priority: "Medium", tags: ["ci", "perf"],
      durationMin: 25, dueDayOffset: -9, dueHour: 16, createdDayOffset: -13,
    },
    {
      title: "Weekly architecture sync",
      description: "Reviewed component boundaries and state-management patterns.",
      category: "demo-cat-meetings", priority: "Medium", tags: ["architecture", "sync"],
      durationMin: 45, dueDayOffset: -7, dueHour: 10, createdDayOffset: -10,
    },
    {
      title: "Research accessibility testing tools",
      description: "Evaluated axe-core, Lighthouse CI, and manual screen-reader workflows.",
      category: "demo-cat-research", priority: "Low", tags: ["a11y", "tooling"],
      durationMin: 60, dueDayOffset: -10, dueHour: 11, createdDayOffset: -14,
    },
  ];
}

// ---------------------------------------------------------------------------
// Recurring series
// ---------------------------------------------------------------------------

function buildRecurringSeries(anchor: Date): {
  tasks: Task[];
  completions: TaskCompletion[];
} {
  const seriesId = "demo-series-arch-sync";
  const tasks: Task[] = [];
  const completions: TaskCompletion[] = [];
  const baseDefs: Array<{ dayOffset: number; completed: boolean; completionSlot?: [number, number, number] }> = [
    { dayOffset: -14, completed: true, completionSlot: [10, 30, 50] },
    { dayOffset: -7, completed: true, completionSlot: [10, 30, 45] },
    { dayOffset: 7, completed: false },
  ];
  for (let i = 0; i < baseDefs.length; i++) {
    const def = baseDefs[i];
    const task: Task = {
      id: id("series-arch", i),
      user_id: owner,
      title: "Weekly architecture sync",
      description: "Review component boundaries and discuss upcoming technical decisions.",
      due_date: isoAt(anchor, def.dayOffset, 17, 0),
      scheduled_start: !def.completed ? isoAt(anchor, def.dayOffset, 14, 0) : null,
      series_id: seriesId,
      occurrence_index: i,
      priority_level: "Medium",
      category_id: "demo-cat-meetings",
      tags: ["architecture", "sync", "recurring"],
      is_recurring: true,
      recurrence_type: "Weekly",
      recurrence_interval: 1,
      estimated_duration: 60,
      status: def.completed ? "Completed" : "Pending",
      completed_at: def.completed && def.completionSlot
        ? isoAt(anchor, def.dayOffset, def.completionSlot[0], def.completionSlot[1])
        : null,
      ai_priority_score: 0,
      created_at: isoAt(anchor, -21, 9),
      updated_at: def.completed && def.completionSlot
        ? isoAt(anchor, def.dayOffset, def.completionSlot[0], def.completionSlot[1])
        : isoAt(anchor, -1, 9),
    };
    tasks.push(task);
    if (def.completed && def.completionSlot) {
      completions.push({
        id: id("compl-series", i),
        user_id: owner,
        task_id: task.id,
        completed_at: task.completed_at!,
        completion_date: calendarDay(new Date(task.completed_at!)),
        actual_duration: def.completionSlot[2],
      });
    }
  }
  return { tasks, completions };
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export interface DemoStore {
  version: 2;
  tasks: Task[];
  categories: Category[];
  task_completions: TaskCompletion[];
  user_preferences: UserPreferences[];
  receipts: Record<string, string>;
}

export function createDemoWorkspace(anchor: Date = new Date()): DemoStore {
  const now = anchor.getTime();
  const categories = buildCategories(anchor);

  // ---- Completed tasks + their completion events ----
  const slots = completionSlots(anchor);
  const completedDefs = completedTaskDefs();
  // We use as many completed tasks as we have completion slots.
  // Both arrays are designed to have equal or compatible lengths.
  const completedCount = Math.min(completedDefs.length, slots.length);
  const tasks: Task[] = [];
  const completions: TaskCompletion[] = [];

  for (let i = 0; i < completedCount; i++) {
    const def = completedDefs[i];
    const [cDay, cHour, cMin, cDuration] = slots[i];
    const completedAt = isoAt(anchor, cDay, cHour, cMin);
    // Ensure completed_at is never in the future
    if (Date.parse(completedAt) > now) continue;

    const task: Task = {
      id: id("task", i),
      user_id: owner,
      title: def.title,
      description: def.description,
      due_date: def.dueDayOffset != null ? isoAt(anchor, def.dueDayOffset, def.dueHour ?? 17, def.dueMinute ?? 0) : null,
      scheduled_start: null,
      priority_level: def.priority,
      category_id: def.category,
      tags: def.tags,
      is_recurring: false,
      estimated_duration: def.durationMin,
      status: "Completed",
      completed_at: completedAt,
      ai_priority_score: 0,
      created_at: isoAt(anchor, def.createdDayOffset, 9, 0),
      updated_at: completedAt,
    };
    tasks.push(task);
    completions.push({
      id: id("compl", i),
      user_id: owner,
      task_id: task.id,
      completed_at: completedAt,
      completion_date: calendarDay(new Date(completedAt)),
      actual_duration: cDuration,
    });
  }

  // ---- Recurring series ----
  const series = buildRecurringSeries(anchor);
  // Filter out series completions that would be in the future
  const validSeriesTasks: Task[] = [];
  const validSeriesCompletions: TaskCompletion[] = [];
  for (const t of series.tasks) {
    if (t.completed_at && Date.parse(t.completed_at) > now) {
      // Convert to pending if completion would be in the future
      validSeriesTasks.push({ ...t, status: "Pending", completed_at: null });
    } else {
      validSeriesTasks.push(t);
      const c = series.completions.find(c => c.task_id === t.id);
      if (c) validSeriesCompletions.push(c);
    }
  }
  tasks.push(...validSeriesTasks);
  completions.push(...validSeriesCompletions);

  // ---- Open tasks ----
  const openDefs = openTaskDefs(anchor);
  const startIdx = completedCount;
  for (let i = 0; i < openDefs.length; i++) {
    const def = openDefs[i];
    const task: Task = {
      id: id("task", startIdx + i),
      user_id: owner,
      title: def.title,
      description: def.description,
      due_date: def.dueDayOffset != null ? isoAt(anchor, def.dueDayOffset, def.dueHour ?? 17, def.dueMinute ?? 0) : null,
      scheduled_start: def.scheduledDayOffset != null
        ? isoAt(anchor, def.scheduledDayOffset, def.scheduledHour ?? 9, def.scheduledMinute ?? 0)
        : null,
      priority_level: def.priority,
      category_id: def.category,
      tags: def.tags,
      is_recurring: false,
      estimated_duration: def.durationMin,
      status: "Pending",
      completed_at: null,
      ai_priority_score: 0,
      created_at: isoAt(anchor, def.createdDayOffset, 9, 0),
      updated_at: isoAt(anchor, -1, 9, 0),
    };
    tasks.push(task);
  }

  // ---- Score all tasks ----
  for (const task of tasks) {
    task.ai_priority_score = task.status === "Completed" ? 0 : scoreTask(task, now);
  }

  // ---- Preferences ----
  const preferences: UserPreferences = {
    id: "demo-preferences",
    user_id: owner,
    preferred_work_hours: { start: "09:00", end: "17:00" },
    daily_task_limit: 8,
    ai_suggestions_enabled: true,
    created_at: isoAt(anchor, -30, 9),
    updated_at: isoAt(anchor, -1, 9),
  };

  return {
    version: 2,
    tasks,
    categories,
    task_completions: completions,
    user_preferences: [preferences],
    receipts: {},
  };
}

/** Compute the expected completion streak for the generated workspace. */
export function computeExpectedStreak(anchor: Date): number {
  return expectedStreak(anchor, completionSlots(anchor));
}
