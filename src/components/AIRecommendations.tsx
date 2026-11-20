import { useWorkspace } from "@/providers/DataProvider";
import { recommendations } from "@/domain/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { usePlannerAction } from "./usePlannerAction";

export default function AIRecommendations({ onPlanner }: { onPlanner: () => void }) {
  const { tasks, preferences, service } = useWorkspace();
  const { busy, run } = usePlannerAction();
  const tips = recommendations(tasks, preferences, new Date());
  return (
    <Card>
      <CardHeader>
        <CardTitle>Task recommendations</CardTitle>
        <CardDescription>Suggestions based on your open tasks and daily target.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="suggestions"
            checked={preferences.ai_suggestions_enabled}
            disabled={busy}
            onCheckedChange={(enabled) =>
              void run(() => service.setSuggestions(enabled), "Preference saved")}
          />
          <Label htmlFor="suggestions">Show suggestions</Label>
        </div>
        {preferences.ai_suggestions_enabled && (tips.length
          ? <ul className="list-disc space-y-2 pl-5">{tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
          : <p>No suggestions for your current tasks.</p>)}
        {preferences.ai_suggestions_enabled && tips.length > 0 && (
          <Button variant="outline" onClick={onPlanner}>Open daily planner</Button>
        )}
      </CardContent>
    </Card>
  );
}
