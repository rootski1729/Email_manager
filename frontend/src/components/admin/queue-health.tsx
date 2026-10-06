"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { useMemo } from "react";

import { ErrorState } from "@/components/common/error-state";
import { RelativeTime } from "@/components/common/relative-time";
import { NotificationCard } from "@/components/deliveries/notification-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { adminQueuesQuery } from "@/lib/api/queries";
import { NOTIFICATION_STATUSES } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { NOTIFICATION_STATUS, TONE_CLASSES } from "@/lib/status";
import { cn } from "@/lib/utils";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function looksLikeIso(s: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(s);
}

export function QueueHealth() {
  const q = useQuery(adminQueuesQuery);
  const outboxTotal = useMemo(
    () => Object.values(q.data?.outbox ?? {}).reduce((a, b) => a + (b ?? 0), 0),
    [q.data],
  );

  if (q.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Task backlog" value={formatNumber(d.task_backlog)} hint="waiting for a worker" />
        <Metric label="Tasks pending ack" value={formatNumber(d.task_pending)} hint="claimed by a worker" />
        <Metric label="Global send tokens" value={d.global_tokens.toFixed(1)} hint="WhatsApp rate limiter" />
        <Metric label="Outbox rows" value={formatNumber(outboxTotal)} hint="all users, all time" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Components</CardTitle>
            <CardDescription>Heartbeats from the background services.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {d.components.map((c) => (
                <li key={c.name} className="flex items-center gap-3 py-2.5">
                  {c.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Healthy" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" aria-label="Unhealthy" />
                  )}
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.detail ? (
                    looksLikeIso(c.detail) ? (
                      <RelativeTime iso={c.detail} className="ml-auto text-xs text-muted-foreground" />
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="ml-auto max-w-[55%] truncate font-mono text-xs text-muted-foreground">{c.detail}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm break-all">{c.detail}</TooltipContent>
                      </Tooltip>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Outbox by status</CardTitle>
            <CardDescription>Every notification row, across all users.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {NOTIFICATION_STATUSES.map((s) => {
                const meta = NOTIFICATION_STATUS[s];
                const n = d.outbox?.[s] ?? 0;
                return (
                  <li key={s} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn("size-1.5 rounded-full", TONE_CLASSES[meta.tone].dot)} aria-hidden />
                      {meta.label}
                    </span>
                    <span className={cn("text-sm font-semibold tabular", n === 0 && "text-muted-foreground")}>{formatNumber(n)}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Dead letters</h2>
        <p className="mb-3 text-sm text-muted-foreground">The 20 most recent notifications that exhausted their retries.</p>
        {d.dead_letters.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No dead letters. Everything was delivered or is still in flight.</p>
        ) : (
          <ul className="space-y-3">
            {d.dead_letters.map((n) => (
              <NotificationCard key={n.id} n={n} showMessageLink={false} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
