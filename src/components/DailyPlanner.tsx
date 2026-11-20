import { useState } from "react";
import { useWorkspace } from "@/providers/DataProvider";
import { statusAt } from "@/domain/metrics";
import { calendarDay } from "@/domain/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import TimeBlocks from "./TimeBlocks";

export default function DailyPlanner() {
  const { tasks } = useWorkspace();
  const [day, setDay] = useState(() => calendarDay(new Date()));
  const selected = new Date(day + "T12:00");
  const due = tasks.filter((task) => task.due_date && calendarDay(new Date(task.due_date)) === day)
    .sort((a, b) => Date.parse(a.due_date!) - Date.parse(b.due_date!));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Daily Planner</CardTitle>
          <CardDescription>Place work on your calendar and keep track of deadlines.</CardDescription>
        </CardHeader>
      </Card>
      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Select date</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="planner-day">Planner date</Label>
            <Input
              id="planner-day"
              type="date"
              value={day}
              onChange={(event) => {
                if (event.target.value) setDay(event.target.value);
              }}
            />
            <Calendar
              mode="single"
              month={selected}
              onMonthChange={(date) => setDay(calendarDay(date))}
              selected={selected}
              onSelect={(date) => {
                if (date) setDay(calendarDay(date));
              }}
              className="p-0"
            />
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4">
          <TimeBlocks key={day} day={day} />
          <Card>
            <CardHeader>
              <CardTitle>
                Deadlines on {selected.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {due.length
                ? (
                  <ul className="space-y-1">
                    {due.map((task) => (
                      <li className="break-words" key={task.id}>
                        {new Date(task.due_date!).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} · {task.title} ({statusAt(task, new Date())})
                      </li>
                    ))}
                  </ul>
                )
                : <p>No deadlines on this date.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
