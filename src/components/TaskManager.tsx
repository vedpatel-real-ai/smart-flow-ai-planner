import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useWorkspace } from "@/providers/DataProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { statusAt } from "@/domain/metrics";
import type { Task } from "@/types/database";
import TaskDialog from "./TaskDialog";
import TaskCard from "./TaskCard";
import { usePlannerAction } from "./usePlannerAction";

export default function TaskManager() {
  const { tasks, service } = useWorkspace();
  const { busy, run } = usePlannerAction();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [editor, setEditor] = useState<{ task: Task | null } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const captureFocus = () => {
    trigger.current = document.activeElement as HTMLElement | null;
  };
  const restoreFocus = () =>
    (trigger.current?.isConnected ? trigger.current : addButton.current)?.focus();
  const now = new Date();
  const needle = query.trim().toLocaleLowerCase();
  const filtered = tasks.filter((task) =>
    (filter === "All" || statusAt(task, now) === filter) &&
    [task.title, task.description ?? "", ...(task.tags ?? [])].some((text) =>
      text.toLocaleLowerCase().includes(needle)
    )
  );
  const remove = (scope: "one" | "series") => {
    if (deleting) {
      void run(
        () => service.remove(deleting.id, scope),
        scope === "one" ? "Task deleted" : "Series deleted",
        () => setDeleting(null),
      );
    }
  };
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Task Manager</CardTitle>
            <CardDescription>
              Open tasks are ranked by priority, deadline, age and duration.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => service.refreshScores(), "Ranking refreshed")}
            >
              Refresh ranking
            </Button>
            <Button
              ref={addButton}
              onClick={() => {
                captureFocus();
                setEditor({ task: null });
              }}
            >
              <Plus className="mr-1 h-4 w-4" />Add Task
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          aria-label="Search tasks"
          type="search"
          placeholder="Search tasks…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div role="group" aria-label="Task status" className="flex flex-wrap gap-2">
          {["All", "Pending", "Completed", "Overdue"].map((name) => (
            <Button
              key={name}
              aria-pressed={filter === name}
              size="sm"
              variant={filter === name ? "default" : "outline"}
              onClick={() => setFilter(name)}
            >
              {name}
            </Button>
          ))}
        </div>
        {filtered.length === 0 && (
          <p>{tasks.length ? "No tasks match your filters." : "No tasks yet."}</p>
        )}
        {filtered.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            status={statusAt(task, now)}
            busy={busy}
            onEdit={() => {
              captureFocus();
              setEditor({ task });
            }}
            onDelete={() => {
              captureFocus();
              setDeleting(task);
            }}
            onComplete={() => void run(() => service.complete(task.id), "Task completed")}
          />
        ))}
        {editor && (
          <TaskDialog
            task={editor.task}
            onClose={() => setEditor(null)}
            restoreFocus={restoreFocus}
          />
        )}
        {deleting && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !busy) setDeleting(null);
            }}
          >
            <DialogContent
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                restoreFocus();
              }}
            >
              <DialogHeader>
                <DialogTitle>Delete {deleting.title}?</DialogTitle>
                <DialogDescription>
                  Deleting a task also removes its completion history.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" disabled={busy} onClick={() => remove("one")}>
                  {deleting.series_id ? "Delete occurrence" : "Delete task"}
                </Button>
                {deleting.series_id && (
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => remove("series")}
                  >
                    Delete entire series
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
