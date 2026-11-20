import type { TaskCompletion } from "../types/database";
import { demoTasks } from "./tasks";

export const demoTaskCompletions: TaskCompletion[] = demoTasks.flatMap((task) => {
  if (task.status !== "Completed" || !task.completed_at) return [];
  return [{
    id: "demo-completion-analytics",
    user_id: task.user_id,
    task_id: task.id,
    completed_at: task.completed_at,
    completion_date: task.completed_at.slice(0, 10),
    actual_duration: 42,
  }];
});
