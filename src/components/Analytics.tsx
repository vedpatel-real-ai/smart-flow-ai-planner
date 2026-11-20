import { useWorkspace } from "@/providers/DataProvider";
import { metrics, statusAt } from "@/domain/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { calendarDay } from "@/domain/calendar";

export default function Analytics() {
  const { tasks, completions, categories } = useWorkspace();
  const now = new Date();
  const today = calendarDay(now);
  const { completed, week, streak, averageDuration, completionRate } = metrics(
    tasks,
    completions,
    now,
  );

  // Status distribution
  const overdue = tasks.filter((t) => statusAt(t, now) === "Overdue").length;
  const pending = tasks.filter((t) => statusAt(t, now) === "Pending").length;
  const statusData = [
    { name: "Pending", count: pending, color: "#3b82f6" },
    { name: "Completed", count: completed, color: "#22c55e" },
    { name: "Overdue", count: overdue, color: "#ef4444" },
  ];

  // Weekly chart data
  const weekData = week.map(({ date, completed: count }) => ({
    day: date.toLocaleDateString(undefined, { weekday: "short" }),
    completions: count,
    isToday: calendarDay(date) === today,
  }));

  // Category workload
  const names = new Map(categories.map((c) => [c.id, c]));
  const catCounts = new Map<string, { open: number; done: number }>();
  for (const task of tasks) {
    const key = task.category_id ?? "";
    const entry = catCounts.get(key) ?? { open: 0, done: 0 };
    if (task.status === "Completed") entry.done++;
    else entry.open++;
    catCounts.set(key, entry);
  }
  const categoryData = [...catCounts].map(([id, { open, done }]) => ({
    name: names.get(id)?.name ?? "Uncategorized",
    color: names.get(id)?.color ?? "#6b7280",
    open,
    done,
    total: open + done,
  })).sort((a, b) => b.total - a.total);

  // Summary cards
  const rows: Array<[string, string | number]> = [
    ["Total tasks", tasks.length],
    ["Completed", completed],
    ["Completion rate", completionRate === null ? "—" : (completionRate * 100).toFixed(1) + "%"],
    [
      "Avg. duration",
      averageDuration === null ? "—" : Math.round(averageDuration) + " min",
    ],
    ["Streak", `${streak} ${streak === 1 ? "day" : "days"}`],
  ];

  // Completion history
  const titles = new Map(tasks.map((task) => [task.id, task]));

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Productivity analytics</h2>

      {/* Summary row */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs">{label}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Weekly completions chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Weekly completions</CardTitle>
            <CardDescription>
              Completion events from Monday through Sunday, by local calendar date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12 }}
                  className="fill-muted-foreground"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  className="fill-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    fontSize: "12px",
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                    color: "hsl(var(--foreground))",
                  }}
                />
                <Bar dataKey="completions" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {weekData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.isToday ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.5)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Task status distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Task status distribution</CardTitle>
            <CardDescription>
              Current breakdown of all {tasks.length} tasks by status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusData.map((entry) => {
              const pct = tasks.length ? ((entry.count / tasks.length) * 100).toFixed(0) : "0";
              return (
                <div key={entry.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: entry.color }}
                        aria-hidden="true"
                      />
                      <span>{entry.name}</span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">{entry.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: tasks.length ? (entry.count / tasks.length * 100) + "%" : "0%",
                        backgroundColor: entry.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Category workload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Category workload</CardTitle>
            <CardDescription>Task count by category — open and completed.</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length
              ? (
                <div className="space-y-3">
                  {categoryData.map((cat) => (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                            aria-hidden="true"
                          />
                          <span>{cat.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {cat.open} open · {cat.done} done
                        </span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          className="h-full"
                          style={{
                            width: tasks.length ? (cat.done / tasks.length * 100) + "%" : "0%",
                            backgroundColor: cat.color,
                            opacity: 0.5,
                          }}
                        />
                        <div
                          className="h-full"
                          style={{
                            width: tasks.length ? (cat.open / tasks.length * 100) + "%" : "0%",
                            backgroundColor: cat.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )
              : <p className="text-sm text-muted-foreground">No tasks yet.</p>}
          </CardContent>
        </Card>

        {/* Completion history */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Latest task completions with recorded durations.</CardDescription>
          </CardHeader>
          <CardContent>
            {completions.length
              ? (
                <ol className="space-y-2.5 max-h-80 overflow-y-auto">
                  {[...completions].sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))
                    .slice(0, 20).map((event) => {
                      const task = titles.get(event.task_id);
                      return (
                        <li className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0" key={event.id}>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-sm font-medium break-words">
                              {task?.title ?? "Task"}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <time dateTime={event.completed_at} className="text-xs text-muted-foreground">
                                {new Date(event.completed_at).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </time>
                              {task?.category && (
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                  style={{ borderColor: task.category.color, color: task.category.color }}
                                >
                                  {task.category.name}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {event.actual_duration != null && (
                            <Badge variant="secondary" className="text-xs whitespace-nowrap">
                              {event.actual_duration} min
                            </Badge>
                          )}
                        </li>
                      );
                    })}
                </ol>
              )
              : <p className="text-sm text-muted-foreground">No completed tasks yet.</p>}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
