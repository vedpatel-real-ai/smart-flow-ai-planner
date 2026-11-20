import { useRef, useState } from "react";
import TaskDialog from "./TaskDialog";
import StatCard from "./StatCard";
import WeeklyActivity from "./WeeklyActivity";
import { useWorkspace } from "@/providers/DataProvider";
import { metrics } from "@/domain/metrics";
import { plannerLists, calendarDay } from "@/domain/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import AIRecommendations from "./AIRecommendations";
import { CheckCircle2, Clock, CalendarCheck, TrendingUp, ArrowRight } from "lucide-react";

export default function DashboardOverview(
  { onTasks, onPlanner }: { onTasks: () => void; onPlanner: () => void },
) {
  const { tasks, completions, preferences } = useWorkspace();
  const { mode } = useAuth();
  const [creating, setCreating] = useState<"task" | "session" | null>(null);
  const planButton = useRef<HTMLButtonElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const now = new Date();
  const { open, completedToday, dueToday, completed, week, streak, completionRate } = metrics(tasks, completions, now);
  const priorities = dueToday.filter((task) => task.status !== "Completed");
  const today = calendarDay(now);
  const { scheduled } = plannerLists(tasks, today);

  return (
    <section className="space-y-6">
      <div className="overview-banner flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 text-white sm:p-7">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your workspace at a glance</h2>
          <p className="text-sm text-teal-50">{priorities.length} open {priorities.length === 1 ? "task" : "tasks"} due today · {scheduled.length} planned {scheduled.length === 1 ? "session" : "sessions"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {mode === "demo" && <span className="text-sm text-teal-50">Sample data · edits stay in this browser</span>}
          <Button ref={createButton} variant="secondary" onClick={() => setCreating("task")}>
            {tasks.length ? "Add task" : "Create your first task"}
          </Button>
        </div>
      </div>
      {creating && <TaskDialog task={null}
        initialPlannedStart={creating === "session" ? today + "T" + preferences.preferred_work_hours.start : undefined}
        onClose={() => setCreating(null)}
        restoreFocus={() => (creating === "session" ? planButton : createButton).current?.focus()} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Due today" value={priorities.length} icon={Clock} detail="Open deadlines" />
        <StatCard label="Completed today" value={completedToday} icon={CheckCircle2} detail={streak ? `${streak}-day streak` : "Recorded activity"} />
        <StatCard label="Open tasks" value={open} icon={CalendarCheck} detail="Across your workspace" />
        <StatCard label="Completion rate" value={completionRate === null ? "—" : (completionRate * 100).toFixed(1) + "%"}
          icon={TrendingUp} detail={`${completed} completed of ${tasks.length} total`} />
      </div>

      {/* Main two-column content */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          {/* Priority tasks */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Today&apos;s priority tasks</CardTitle>
              <CardDescription>Open tasks due today, ranked by score.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {priorities.length
                ? (
                  <ol className="space-y-2">
                    {priorities.map((task) => (
                      <li
                        key={task.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-medium leading-tight break-words">{task.title}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="text-xs">{task.priority_level}</Badge>
                            {task.category && (
                              <Badge
                                variant="outline"
                                className="text-xs"
                                style={{ borderLeft: `3px solid ${task.category.color}` }}
                              >
                                {task.category.name}
                              </Badge>
                            )}
                            {task.due_date && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(task.due_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          Score {(task.ai_priority_score ?? 0).toFixed(1)}
                        </Badge>
                      </li>
                    ))}
                  </ol>
                )
                : <p className="text-sm text-muted-foreground">No open tasks due today.</p>}
              <Button variant="outline" size="sm" onClick={onTasks} className="w-full">
                Open task manager <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>

          {/* Scheduled work preview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Today&apos;s planned schedule</CardTitle>
              <CardDescription>
                {scheduled.length
                  ? `${scheduled.length} work ${scheduled.length === 1 ? "session" : "sessions"} scheduled.`
                  : "No work scheduled for today."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {scheduled.length > 0 && (
                <ol className="space-y-2">
                  {scheduled.map((task) => {
                    const start = new Date(task.scheduled_start!);
                    const end = new Date(start.getTime() + (task.estimated_duration ?? 30) * 60_000);
                    return (
                      <li key={task.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <div className="text-sm font-medium tabular-nums text-muted-foreground whitespace-nowrap">
                          {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          –{end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-tight break-words">{task.title}</p>
                          {task.category && (
                            <span className="text-xs text-muted-foreground">
                              {task.category.name}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              <Button ref={planButton} variant="outline" size="sm" onClick={tasks.length ? onPlanner : () => setCreating("session")} className="w-full">
                {tasks.length ? "View daily planner" : "Plan your first work session"} <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <WeeklyActivity title="Weekly productivity" week={week} today={today} />

          {/* Recommendations */}
          <AIRecommendations onPlanner={onPlanner} />
        </div>
      </div>
    </section>
  );
}
