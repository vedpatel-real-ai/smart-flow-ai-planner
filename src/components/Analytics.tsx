import { useWorkspace } from "@/providers/DataProvider";
import { metrics } from "@/domain/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Analytics() {
  const { tasks, completions, categories } = useWorkspace();
  const { completed, week, streak, averageDuration, completionRate } = metrics(
    tasks,
    completions,
    new Date(),
  );
  const rows = [
    ["Current tasks", tasks.length],
    ["Completed tasks", completed],
    ["Completion rate", completionRate === null ? "—" : (completionRate * 100).toFixed(1) + "%"],
    [
      "Average recorded duration",
      averageDuration === null ? "No measurements" : Math.round(averageDuration) + " min",
    ],
    ["Completion streak", `${streak} ${streak === 1 ? "day" : "days"}`],
  ];
  const titles = new Map(tasks.map((task) => [task.id, task.title]));
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const counts = new Map<string, number>();
  for (const task of tasks) {
    counts.set(task.category_id ?? "", (counts.get(task.category_id ?? "") ?? 0) + 1);
  }
  const peak = Math.max(1, ...week.map((day) => day.completed));
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Productivity analytics</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle>{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weekly completions</CardTitle>
            <CardDescription>
              Completion events from Monday through Sunday, by local calendar date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {week.map(({ date, completed }) => (
                <li key={date.getTime()} className="flex items-center gap-3">
                  <span className="w-24">
                    {date.toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: (completed / peak * 100) + "%" }}
                    />
                  </div>
                  <span>{completed}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Task categories</CardTitle>
            <CardDescription>Number of current tasks in each category.</CardDescription>
          </CardHeader>
          <CardContent>
            {tasks.length
              ? (
                <ul className="space-y-2">
                  {[...counts].map(([id, count]) => (
                    <li key={id} className="flex justify-between gap-3">
                      <span>
                        {names.get(id) ?? "Uncategorized"}
                      </span>
                      <span>{count}</span>
                    </li>
                  ))}
                </ul>
              )
              : <p>No tasks yet.</p>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Completion history</CardTitle>
          <CardDescription>Recent completion events for tasks still in your workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {completions.length
            ? (
              <ol className="space-y-2">
                {[...completions].sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))
                  .slice(0, 20).map((event) => (
                    <li className="flex flex-wrap justify-between gap-2 border-b py-2" key={event.id}>
                      <span className="break-words">
                        {titles.get(event.task_id) ?? "Task"}
                      </span>
                      <time dateTime={event.completed_at}>
                        {new Date(event.completed_at).toLocaleString()}
                      </time>
                    </li>
                  ))}
              </ol>
            )
            : <p>No completed tasks yet.</p>}
        </CardContent>
      </Card>
    </section>
  );
}
