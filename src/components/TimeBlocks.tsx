import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useWorkspace } from "@/providers/DataProvider";
import { bookedInterval, inputInstant, localInput, overlaps, plannerLists } from "@/domain/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Task } from "@/types/database";
import { usePlannerAction } from "./usePlannerAction";

function TaskPlacement(
  { task, busy, onSelect }: { task: Task; busy: boolean; onSelect: (task: Task) => void },
) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: busy,
  });
  const interval = bookedInterval(task);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <button
        ref={setNodeRef}
        {...listeners}
        type="button"
        disabled={busy}
        aria-label={`Drag ${task.title}`}
        title="Drag to a working hour, or activate to choose a time"
        onClick={() => onSelect(task)}
        className={`inline-flex h-11 w-11 touch-none items-center justify-center rounded border focus-visible:outline-primary ${
          isDragging ? "opacity-50" : "cursor-grab"
        }`}
      >
        <GripVertical size={18} />
      </button>
      <div className="min-w-0 flex-1 basis-28">
        <p className="break-words font-medium">{task.title}</p>
        <p className="text-xs text-muted-foreground">
          {interval
            ? `${new Date(interval[0]).toLocaleString()} – ${new Date(interval[1]).toLocaleString()}`
            : `${task.estimated_duration ?? 30} min · ${task.priority_level}`}
        </p>
      </div>
      <Button
        variant="outline"
        disabled={busy}
        aria-label={`${interval ? "Reschedule" : "Schedule"} ${task.title}`}
        onClick={() => onSelect(task)}
      >
        {interval ? "Reschedule" : "Schedule"}
      </Button>
    </li>
  );
}

function DropSlot({ start, end, tasks }: { start: number; end: number; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: String(start) });
  const names = tasks.filter((task) => overlaps(bookedInterval(task)!, [start, end])).map((task) =>
    task.title
  );
  return (
    <li
      ref={setNodeRef}
      className={`min-h-12 rounded-md border border-dashed p-2 text-sm ${
        isOver ? "border-primary bg-primary/10" : ""
      }`}
    >
      <span className="font-medium">
        {new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="ml-2 break-words text-muted-foreground">
        {names.length ? names.join(", ") : "Available"}
      </span>
    </li>
  );
}

export default function TimeBlocks({ day }: { day: string }) {
  const { tasks, service, preferences } = useWorkspace();
  const { run, busy } = usePlannerAction();
  const [selected, setSelected] = useState<Task | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const trigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { backlog, scheduled } = plannerLists(tasks, day);
  const hours = preferences.preferred_work_hours;
  const start = new Date(day + "T" + hours.start).getTime();
  const end = new Date(day + "T" + hours.end).getTime();
  const slots: number[] = [];
  for (let time = start; time < end; time += 3_600_000) slots.push(time);
  const onSelect = (task: Task) => {
    trigger.current = document.activeElement as HTMLElement;
    setSelected(task);
  };
  const place = (task: Task, instant: string | null) =>
    run(
      async () => {
        const candidate = bookedInterval({ ...task, scheduled_start: instant });
        if (candidate) {
          const conflict = tasks.find((other) => {
            const interval = bookedInterval(other);
            return other.id !== task.id && interval && overlaps(candidate, interval);
          });
          if (conflict) throw new Error(`This time overlaps “${conflict.title}”. Choose another start.`);
        }
        await service.update(task.id, { scheduled_start: instant });
      },
      instant ? "Task scheduled" : "Task removed from schedule",
      () => setSelected(null),
    );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      // Keep visible slots stationary until the pointer reaches the viewport edge.
      autoScroll={{ threshold: { x: 0.01, y: 0.025 } }}
      onDragStart={({ active }) =>
        setDragging(tasks.find((task) => task.id === active.id)?.title ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={({ active, over }) => {
        setDragging(null);
        const task = tasks.find((item) => item.id === active.id);
        const time = Number(over?.id);
        if (task && slots.includes(time)) void place(task, new Date(time).toISOString());
      }}
    >
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Scheduled work</CardTitle>
            <CardDescription>
              Open tasks occupying any part of this day, including work outside preferred hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scheduled.length
              ? (
                <ul className="space-y-2">
                  {scheduled.map((task) => (
                    <TaskPlacement key={task.id} task={task} busy={busy} onSelect={onSelect} />
                  ))}
                </ul>
              )
              : <p>No work scheduled on this date.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h3 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight">
              Unscheduled tasks
            </h3>
            <CardDescription>Open tasks across all dates with no planned start.</CardDescription>
          </CardHeader>
          <CardContent>
            {backlog.length
              ? (
                <ul className="space-y-2">
                  {backlog.map((task) => (
                    <TaskPlacement key={task.id} task={task} busy={busy} onSelect={onSelect} />
                  ))}
                </ul>
              )
              : <p>No unscheduled tasks.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Working hours</CardTitle>
            <CardDescription>
              Drag a task to a start time or use its Schedule button for any time of day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {slots.map((time) => (
                <DropSlot
                  key={time}
                  start={time}
                  end={Math.min(time + 3_600_000, end)}
                  tasks={scheduled}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      {selected && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setSelected(null);
          }}
        >
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              (trigger.current?.isConnected ? trigger.current : heading.current)?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Schedule {selected.title}</DialogTitle>
              <DialogDescription>
                Reserve {selected.estimated_duration ?? 30} minutes in{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const control = event.currentTarget.elements.namedItem("start") as HTMLInputElement;
                try {
                  void place(selected, inputInstant(control.value, selected.scheduled_start));
                } catch (error) {
                  control.setCustomValidity(
                    error instanceof Error ? error.message : "Choose a valid time.",
                  );
                  control.reportValidity();
                }
              }}
            >
              <Label htmlFor="placement">Planned start</Label>
              <Input
                type="datetime-local"
                id="placement"
                name="start"
                required
                defaultValue={localInput(selected.scheduled_start) || day + "T" + hours.start}
                onChange={(event) => event.target.setCustomValidity("")}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </Button>
                {selected.scheduled_start && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void place(selected, null)}
                  >
                    Return to backlog
                  </Button>
                )}
                <Button type="submit" disabled={busy}>Save placement</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="pointer-events-none w-max max-w-64 rounded-md border bg-background px-3 py-2 text-sm shadow">
            {dragging}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
