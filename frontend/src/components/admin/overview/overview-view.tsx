"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Mail, MailCheck, MessageCircle, Send, UserCheck, Users } from "lucide-react";
import Link from "next/link";

import { KpiCard } from "@/components/admin/common/kpi-card";
import { TONE, ToneBadge } from "@/components/admin/common/tone-badge";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAuth } from "@/lib/admin/auth-provider";
import { MAILBOX_STATUS, NOTIFICATION_STATUS, wahaWords } from "@/lib/admin/labels";
import { overviewQuery } from "@/lib/admin/queries";
import { MAILBOX_STATUSES, type NotificationStatus } from "@/lib/admin/types";
import { formatNumber } from "@/lib/format";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";
import { FailedMessages } from "./failed-messages";
import { OverviewChart } from "./overview-chart";
import { SystemStatus } from "./system-status";

const OUTBOX_ORDER: NotificationStatus[] = [
  "queued",
  "sending",
  "held",
  "sent",
  "delivered",
  "read",
  "folded",
  "failed",
  "dead",
  "cancelled",
];

function greeting(now: number): string {
  if (!now) return "Hello";
  const h = new Date(now).getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading overview">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export function OverviewView() {
  const { admin } = useAdminAuth();
  const q = useQuery(overviewQuery);
  const now = useNow();
  const name = admin?.display_name?.split(" ")[0] || admin?.username;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${greeting(now)}${name ? `, ${name}` : ""}`}
        description="Here's how MailSentinel is doing across every client."
        className="pb-0"
        actions={
          q.data ? (
            <ToneBadge tone={wahaWords(q.data.whatsapp_status).tone}>
              WhatsApp: {wahaWords(q.data.whatsapp_status).label}
            </ToneBadge>
          ) : null
        }
      />
      {q.isPending ? (
        <OverviewSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label="Clients"
              value={formatNumber(q.data.clients)}
              hint={`${formatNumber(q.data.new_clients_7d)} joined this week`}
              icon={Users}
              href="/admin/clients"
            />
            <KpiCard
              label="Active this week"
              value={formatNumber(q.data.active_clients_7d)}
              hint="Signed in during the last 7 days"
              icon={UserCheck}
              tone="info"
            />
            <KpiCard
              label="Important emails (24 h)"
              value={formatNumber(q.data.matched_24h)}
              hint={`Matched by ${formatNumber(q.data.rules)} rules`}
              icon={MailCheck}
              tone="brand"
              href="/admin/rules"
            />
            <KpiCard
              label="WhatsApp alerts sent (24 h)"
              value={formatNumber(q.data.alerts_sent_24h)}
              hint={
                q.data.alerts_failed_24h > 0 ? (
                  <span className="font-medium text-destructive">{formatNumber(q.data.alerts_failed_24h)} failed</span>
                ) : (
                  "None failed"
                )
              }
              icon={MessageCircle}
              tone={q.data.alerts_failed_24h > 0 ? "danger" : "success"}
              href="/admin/whatsapp"
            />
            <KpiCard
              label="Emails sent from WhatsApp (7 d)"
              value={formatNumber(q.data.emails_sent_7d)}
              hint="Written with /email or /reply"
              icon={Send}
              tone="info"
            />
            <KpiCard
              label="Upcoming dates"
              value={formatNumber(q.data.upcoming_events)}
              hint="Exams, interviews and deadlines"
              icon={CalendarClock}
              tone="warning"
            />
          </section>

          <div className="grid items-start gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <OverviewChart series={q.data.series} />
            </div>
            <SystemStatus items={q.data.health} />
          </div>

          <div className="grid items-start gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" /> Mailboxes
                </CardTitle>
                <CardDescription>Every connected inbox, by health.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-2 gap-2">
                  {MAILBOX_STATUSES.map((s) => {
                    const meta = MAILBOX_STATUS[s];
                    const n = q.data.mailboxes[s] ?? 0;
                    return (
                      <li key={s}>
                        <Link
                          href={`/admin/mailboxes?status=${s}`}
                          className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted"
                        >
                          <span className="flex items-center gap-2 text-sm">
                            <span aria-hidden className={cn("size-2 rounded-full", TONE[meta.tone].dot)} />
                            {meta.label}
                          </span>
                          <span className={cn("text-lg font-semibold tabular", n === 0 && "text-muted-foreground")}>
                            {formatNumber(n)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="size-4 text-muted-foreground" /> WhatsApp queue
                </CardTitle>
                <CardDescription>All WhatsApp messages ever queued, by where they are now.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {OUTBOX_ORDER.map((s) => {
                    const meta = NOTIFICATION_STATUS[s];
                    const n = q.data.outbox[s] ?? 0;
                    return (
                      <li key={s} className="flex flex-col gap-0.5 rounded-lg border px-3 py-2">
                        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE[meta.tone].dot)} />
                          {meta.label}
                        </span>
                        <span className={cn("text-base font-semibold tabular", n === 0 && "text-muted-foreground")}>
                          {formatNumber(n)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Failed WhatsApp messages</h2>
                <p className="text-sm text-muted-foreground">
                  Messages that couldn&apos;t be delivered. Fix WhatsApp first, then retry them.
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/whatsapp">WhatsApp settings</Link>
              </Button>
            </div>
            <FailedMessages limit={10} />
          </section>
        </>
      )}
    </div>
  );
}
