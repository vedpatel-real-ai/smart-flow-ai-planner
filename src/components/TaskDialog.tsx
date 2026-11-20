import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/providers/DataProvider";
import { changedFields } from "@/domain/taskEdits";
import { inputInstant, localInput, occurrences } from "@/domain/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PriorityLevel, RecurrenceType, Task } from "@/types/database";
import { usePlannerAction } from "./usePlannerAction";

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";

interface Props {
  task: Task | null;
  initialPlannedStart?: string;
  onClose: () => void;
  restoreFocus: () => void;
}

export default function TaskDialog({ task, initialPlannedStart, onClose, restoreFocus }: Props) {
  const { categories, service } = useWorkspace();
  const { user } = useAuth();
  const { run, busy } = usePlannerAction();
  const [scope, setScope] = useState<"one" | "series">("one");
  const [recurring, setRecurring] = useState(false);
  // Keep the same operation identity across retries of this open form.
  const [request] = useState(() => ({
    series: crypto.randomUUID(),
    ids: Array.from({ length: 30 }, () => crypto.randomUUID()),
    created: new Date().toISOString(),
  }));
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? "").trim();
    void run(
      async () => {
        const title = field("title");
        if (!title) throw new Error("Enter a task title.");
        const metadata = {
          title,
          description: field("description") || null,
          category_id: field("category") || null,
          tags: field("tags").split(",").map((tag) => tag.trim()).filter(Boolean),
          priority_level: field("priority") as PriorityLevel,
          estimated_duration: field("duration") ? Number(field("duration")) : null,
        };
        if (task) {
          const values = scope === "series" ? metadata : {
            ...metadata,
            due_date: inputInstant(field("due"), task.due_date),
            scheduled_start: inputInstant(field("start"), task.scheduled_start),
          };
          const patch = changedFields(task, values);
          if (Object.keys(patch).length) await service.update(task.id, patch, scope);
          return;
        }
        const due = inputInstant(field("due"));
        const start = inputInstant(field("start"));
        if (!user) throw new Error("Open your workspace again.");
        if (recurring && !due && !start) {
          throw new Error(
            "Set a deadline or planned start for the first occurrence.",
          );
        }
        const frequency = field("frequency") as RecurrenceType;
        const interval = recurring ? Number(field("interval")) : 1;
        const count = recurring ? Number(field("count")) : 1;
        const dates = (instant: string | null) =>
          instant && recurring ? occurrences(instant, frequency, interval, count) : [instant];
        const deadlines = dates(due);
        const starts = dates(start);
        const rows = Array.from({ length: count }, (_, index): Task => ({
          ...metadata,
          id: request.ids[index],
          user_id: user.id,
          due_date: deadlines[index] ?? null,
          scheduled_start: starts[index] ?? null,
          status: "Pending",
          is_recurring: recurring,
          series_id: recurring ? request.series : null,
          occurrence_index: recurring ? index : null,
          recurrence_type: recurring ? frequency : null,
          recurrence_interval: interval,
          ai_priority_score: 0,
          created_at: request.created,
          updated_at: request.created,
        }));
        await service.create(rows);
      },
      task ? "Task updated" : "Task created",
      onClose,
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "Create New Task"}</DialogTitle>
          <DialogDescription>
            Dates and times use {Intl.DateTimeFormat().resolvedOptions().timeZone}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {task?.series_id && (
            <div>
              <Label htmlFor="scope">Apply changes to</Label>
              <select
                id="scope"
                className={selectClass}
                value={scope}
                onChange={(event) => setScope(event.target.value as "one" | "series")}
              >
                <option value="one">This occurrence</option>
                <option value="series">Entire series</option>
              </select>
            </div>
          )}
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={task?.title} required autoFocus />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={task?.description ?? ""}
              rows={2}
            />
          </div>
          {scope === "one" && (
            <>
              <div>
                <Label htmlFor="due_date">Due date</Label>
                <Input
                  id="due_date"
                  name="due"
                  type="datetime-local"
                  defaultValue={localInput(task?.due_date)}
                />
              </div>
              <div>
                <Label htmlFor="scheduled_start">Planned start</Label>
                <Input
                  id="scheduled_start"
                  name="start"
                  type="datetime-local"
                  defaultValue={task ? localInput(task.scheduled_start) : initialPlannedStart}
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                name="priority"
                className={selectClass}
                defaultValue={task?.priority_level ?? "Medium"}
              >
                {["Low", "Medium", "High", "Critical"].map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                name="duration"
                type="number"
                min="1"
                max="1440"
                placeholder="30"
                defaultValue={task?.estimated_duration ?? ""}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              name="category"
              className={selectClass}
              defaultValue={task?.category_id ?? ""}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option value={category.id} key={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" name="tags" defaultValue={task?.tags?.join(", ")} />
          </div>
          {!task && (
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(event) => setRecurring(event.target.checked)}
              />Recurring task
            </label>
          )}
          {recurring && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="frequency">Repeat</Label>
                <select id="frequency" name="frequency" className={selectClass}>
                  {["Daily", "Weekly", "Monthly"].map((value) => <option key={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="interval">Interval</Label>
                <Input
                  id="interval"
                  name="interval"
                  type="number"
                  min="1"
                  max="365"
                  required
                  defaultValue={1}
                />
              </div>
              <div>
                <Label htmlFor="count">Occurrences</Label>
                <Input
                  id="count"
                  name="count"
                  type="number"
                  min="1"
                  max="30"
                  required
                  defaultValue={5}
                />
              </div>
            </div>
          )}
          {task?.series_id && (
            <p className="text-sm text-muted-foreground">
              Changes to the entire series apply only to the fields you edit. Change dates for one
              occurrence at a time.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : task ? "Update Task" : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
