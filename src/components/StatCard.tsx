import type { LucideIcon } from "lucide-react";
import { Card } from "./ui/card";

export default function StatCard({ label, value, icon: Icon, detail }: {
  label: string; value: string | number; icon?: LucideIcon; detail?: string;
}) {
  return <Card className="relative min-w-0 p-4 sm:p-5">
    <dl className="space-y-2">
      <dt className="flex items-center justify-between gap-1 text-sm font-medium text-muted-foreground">
        {label}
        {Icon && <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />}
      </dt>
      <dd className="text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
    </dl>
    {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
  </Card>;
}
