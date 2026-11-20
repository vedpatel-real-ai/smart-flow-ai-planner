import { useWorkspace } from "@/providers/DataProvider";
import { metrics } from "@/domain/metrics";
import { plannerLists, calendarDay } from "@/domain/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import AIRecommendations from "./AIRecommendations";
import { CheckCircle2, Clock, CalendarCheck, TrendingUp, Flame, ArrowRight } from "lucide-react";

export default function DashboardOverview(
  { onTasks, onPlanner }: { onTasks: () => void; onPlanner: () => void },
) {
  const { tasks, completions, preferences } = useWorkspace();
  const { mode } = useAuth();
  const now = new Date();
  const { open, completedToday, dueToday, completed, week, streak, completionRate } = metrics(tasks, completions, now);
  const priorities = dueToday.filter((task) => task.status !== "Completed");
  const today = calendarDay(now);
  const { scheduled } = plannerLists(tasks, today);

  return (
    <section className="space-y-6">
      {/* Welcome header */}
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Your workspace at a glance</h2>
        <p className="text-sm text-muted-foreground">
          You have {priorities.length} {priorities.length === 1 ? "task" : "tasks"} due today
          and {scheduled.length} planned work {scheduled.length === 1 ? "session" : "sessions"}.
          {mode === "demo" && (
            <Badge variant="outline" className="ml-2 text-xs font-normal">
              Sample data · edits stay in this browser
            </Badge>
          )}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
            <CardDescription className="text-xs font-medium">Due today</CardDescription>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold">{dueToday.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
            <CardDescription className="text-xs font-medium">Completed today</CardDescription>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold">{completedToday}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
            <CardDescription className="text-xs font-medium">Open tasks</CardDescription>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold">{open}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
            <CardDescription className="text-xs font-medium">Completion rate</CardDescription>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold">
              {completionRate === null ? "—" : (completionRate * 100).toFixed(1) + "%"}
            </p>
            {streak > 0 && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Flame className="h-3 w-3 text-orange-500" />
                {streak}-day streak
              </p>
            )}
          </CardContent>
        </Card>
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
                                style={{ borderColor: task.category.color, color: task.category.color }}
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
                            <span className="text-xs" style={{ color: task.category.color }}>
                              {task.category.name}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              <Button variant="outline" size="sm" onClick={onPlanner} className="w-full">
                View daily planner <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Weekly productivity preview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Weekly productivity</CardTitle>
              <CardDescription>Completions this week, Monday through Sunday.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {week.map(({ date, completed: count }) => {
                  const isToday = calendarDay(date) === today;
                  const peak = Math.max(1, ...week.map((d) => d.completed));
                  return (
                    <div key={date.getTime()} className="flex items-center gap-3">
                      <span className={`w-10 text-xs tabular-nums ${isToday ? "font-bold" : "text-muted-foreground"}`}>
                        {date.toLocaleDateString(undefined, { weekday: "short" })}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          className={`h-full rounded-full transition-all ${isToday ? "bg-primary" : "bg-primary/60"}`}
                          style={{ width: (count / peak * 100) + "%" }}
                        />
                      </div>
                      <span className={`w-5 text-right text-xs tabular-nums ${isToday ? "font-bold" : "text-muted-foreground"}`}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {completed} completed of {tasks.length} total
              </p>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <AIRecommendations onPlanner={onPlanner} />
        </div>
      </div>
    </section>
  );
}
