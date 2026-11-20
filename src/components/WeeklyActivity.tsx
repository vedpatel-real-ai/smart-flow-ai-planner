import { calendarDay } from "@/domain/calendar";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

export default function WeeklyActivity({ title, week, today }: {
  title: string; week: { date: Date; completed: number }[]; today: string;
}) {
  const days = week.map(({ date, completed }) => ({
    day: date.toLocaleDateString(undefined, { weekday: "short" }),
    date: calendarDay(date), completed,
  }));
  const total = days.reduce((sum, day) => sum + day.completed, 0);
  return <Card className="min-w-0">
    <CardHeader className="pb-3">
      <CardTitle className="text-base">{title}</CardTitle>
      <CardDescription>{total} {total === 1 ? "completion" : "completions"} this week · Monday to Sunday</CardDescription>
    </CardHeader>
    <CardContent>
      {total ? <>
        <ul className="sr-only" aria-label="Daily completions">
          {days.map(day => <li key={day.date}>{day.day}: {day.completed}</li>)}
        </ul>
        <div aria-hidden="true">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -30 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}/>
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}/>
              <Tooltip cursor={{fill: "hsl(var(--muted))"}}/>
              <Bar dataKey="completed" name="Completed" radius={[5, 5, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                {days.map(day => <Cell key={day.date} fill={day.date === today ? "#075b56" : "#50a9a0"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </> : <p className="rounded-lg bg-muted p-5 text-sm text-muted-foreground">No completions this week. Complete a task to see your daily activity here.</p>}
    </CardContent>
  </Card>;
}
