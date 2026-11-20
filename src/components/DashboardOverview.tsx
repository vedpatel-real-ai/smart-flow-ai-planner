import { useWorkspace } from "@/providers/DataProvider";
import { metrics } from "@/domain/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AIRecommendations from "./AIRecommendations";

export default function DashboardOverview(
  { onTasks, onPlanner }: { onTasks: () => void; onPlanner: () => void },
) {
  const { tasks, completions } = useWorkspace();
  const { open, completedToday, dueToday, completed } = metrics(tasks, completions, new Date());
  const priorities = dueToday.filter((task) => task.status !== "Completed");
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Due today", dueToday.length], ["Completed today", completedToday], ["Open tasks", open], [
          "Completed tasks",
          completed,
        ]].map(([title, value]) => (
          <Card key={title}>
            <CardHeader className="p-4">
              <CardDescription>{title}</CardDescription>
              <CardTitle>{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today's priority tasks</CardTitle>
            <CardDescription>Open tasks due today, ordered by their saved score.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {priorities.length
              ? (
                <ol className="space-y-2">
                  {priorities.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap justify-between gap-2 rounded border p-2"
                    >
                      <span className="break-words">{task.title}</span>
                      <span>Score {task.ai_priority_score.toFixed(1)}</span>
                    </li>
                  ))}
                </ol>
              )
              : <p>No open tasks due today.</p>}
            <Button variant="outline" onClick={onTasks}>Open task manager</Button>
          </CardContent>
        </Card>
        <AIRecommendations onPlanner={onPlanner} />
      </div>
    </section>
  );
}
