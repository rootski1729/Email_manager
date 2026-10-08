"use client";

import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { overviewQuery } from "@/lib/api/queries";
import { formatCompact } from "@/lib/format";

/** Three plain numbers for the last seven days. No chart, no jargon. */
export function WeekSummary() {
  const overview = useQuery(overviewQuery);
  if (overview.isPending) return <Skeleton className="h-[132px] rounded-2xl" />;
  if (overview.isError) return null;
  const week = overview.data.series.slice(-7);
  const total = week.reduce(
    (acc, d) => ({ scanned: acc.scanned + d.scanned, matched: acc.matched + d.matched, sent: acc.sent + d.sent }),
    { scanned: 0, matched: 0, sent: 0 },
  );
  const stats = [
    { label: "Emails checked", value: total.scanned },
    { label: "Were important", value: total.matched },
    { label: "Sent to WhatsApp", value: total.sent },
  ];
  return (
    <Card className="animate-rise gap-3 py-4">
      <div className="px-4">
        <h2 className="text-base font-semibold tracking-tight">This week</h2>
        <p className="text-sm text-muted-foreground">The last 7 days at a glance.</p>
      </div>
      <dl className="grid grid-cols-3 divide-x px-1">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 px-3">
            <dd className="text-2xl font-semibold tracking-tight tabular sm:text-3xl">{formatCompact(s.value)}</dd>
            <dt className="mt-0.5 text-xs text-muted-foreground text-pretty">{s.label}</dt>
          </div>
        ))}
      </dl>
    </Card>
  );
}
