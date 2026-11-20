import { CheckCircle, Edit, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Task, TaskStatus } from "@/types/database";

interface Props {
  task: Task;
  status: TaskStatus;
  busy: boolean;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
}

export default function TaskCard({ task, status, busy, onEdit, onComplete, onDelete }: Props) {
  return (
    <Card className="border-l-4 shadow-none" style={{ borderLeftColor: task.category?.color ?? "hsl(var(--border))" }}>
      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1 basis-60 space-y-2 break-words">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={status === "Completed" ? "font-medium line-through" : "font-medium"}>
              {task.title}
            </h3>
            <Badge variant="secondary">{task.priority_level}</Badge>
            <Badge variant="outline">{status}</Badge>
            {status !== "Completed" && (
              <Badge variant="outline">Score {task.ai_priority_score.toFixed(1)}</Badge>
            )}
          </div>
          {task.description && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {task.due_date && <span>Due {new Date(task.due_date).toLocaleString()}</span>}
            {task.scheduled_start && (
              <span>Planned {new Date(task.scheduled_start).toLocaleString()}</span>
            )}
            {task.estimated_duration && <span>{task.estimated_duration} min</span>}
            {task.category && <span>{task.category.name}</span>}
            {task.series_id && <span>Series occurrence {(task.occurrence_index ?? 0) + 1}</span>}
          </div>
          {!!task.tags?.length && <p className="flex flex-wrap gap-1 text-xs text-muted-foreground">{task.tags.map((tag, i) => <span className="rounded bg-muted px-2 py-1" key={i}>{tag}</span>)}</p>}
        </div>
        <div className="flex flex-wrap gap-1">
          {status !== "Completed" && (
            <Button
              variant="outline"
              className="h-11 w-11 p-0"
              aria-label={`Complete ${task.title}`}
              disabled={busy}
              onClick={onComplete}
            >
              <CheckCircle size={16} />
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11 w-11 p-0"
            aria-label={`Edit ${task.title}`}
            disabled={busy}
            onClick={onEdit}
          >
            <Edit size={16} />
          </Button>
          <Button
            variant="outline"
            className="h-11 w-11 p-0"
            aria-label={`Delete ${task.title}`}
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
