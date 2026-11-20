export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type RecurrenceType = 'Daily' | 'Weekly' | 'Monthly' | 'Custom';
export type TaskStatus = 'Pending' | 'Completed' | 'Overdue';

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  scheduled_start?: string | null;
  series_id?: string | null;
  occurrence_index?: number | null;
  priority_level: PriorityLevel;
  category_id?: string | null;
  tags?: string[] | null;
  is_recurring: boolean;
  recurrence_type?: RecurrenceType | null;
  recurrence_interval?: number | null;
  estimated_duration?: number | null;
  status: TaskStatus;
  completed_at?: string | null;
  ai_priority_score: number;
  parent_task_id?: string | null;
  created_at: string;
  updated_at: string;
  category?: Category;
  subtasks?: Task[];
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TaskCompletion {
  id: string;
  user_id: string;
  task_id: string;
  completed_at: string;
  actual_duration?: number | null;
  completion_date: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  preferred_work_hours: {
    start: string;
    end: string;
  };
  daily_task_limit: number;
  ai_suggestions_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  display_name?: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}