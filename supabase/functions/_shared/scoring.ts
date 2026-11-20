export interface ScoringInput {
  priority_level?: string | null;
  due_date?: string | null;
  created_at?: string | null;
  estimated_duration?: number | null;
}

const day = 86_400_000;
const priorities = new Map([["Low", 1], ["Medium", 2], ["High", 3], ["Critical", 4]]);

/** Fixed UTC elapsed-time thresholds. One clock sample applies to the entire batch. */
export function scoreTask(task: ScoringInput, now: number): number {
  const priority = priorities.get(task.priority_level ?? "") ?? 2;
  const daysToDeadline = (Date.parse(task.due_date ?? "") - now) / day;
  const age = (now - Date.parse(task.created_at ?? "")) / day;
  const duration = task.estimated_duration ?? 0;
  let urgency = 0;
  if (daysToDeadline < 1) urgency = 3;
  else if (daysToDeadline < 3) urgency = 2;
  else if (daysToDeadline < 7) urgency = 1;
  return (priority * 20 + urgency * 10 + (age > 7 ? 5 : 0) + (duration > 0 && duration <= 30 ? 3 : 0)) / 10;
}
