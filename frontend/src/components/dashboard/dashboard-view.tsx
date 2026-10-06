"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";

import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { destinationsQuery, mailboxesQuery, overviewQuery } from "@/lib/api/queries";
import type { WahaHealth } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";
import { ActivityChart } from "./activity-chart";
import { HealthCard } from "./health-pills";
import { KpiTiles, KpiTilesSkeleton } from "./kpi-tiles";
import { LiveFeed } from "./live-feed";
import { Onboarding } from "./onboarding";
import { RecentSent } from "./recent-sent";

function greeting(name?: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Welcome back, ${first}` : "Overview";
}

export function DashboardView() {
  const { user } = useAuth();
  const overview = useQuery(overviewQuery);
  const mailboxes = useQuery(mailboxesQuery);
  const destinations = useQuery(destinationsQuery);

  const o = overview.data;
  const mailboxCount = mailboxes.data?.length ?? 0;
  const ready = o && mailboxes.data && destinations.data;
  const showOnboarding =
    ready && (mailboxCount === 0 || o.rules_total === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={greeting(user?.display_name)}
        description="What MailSentinel caught across your inboxes, and how alerts are flowing."
        actions={
          <Button asChild>
            <Link href="/rules/new">
              <Plus /> New rule
            </Link>
          </Button>
        }
        className="pb-0"
      />

      {showOnboarding ? (
        <Onboarding
          hasMailbox={mailboxCount > 0}
          hasRule={(o?.rules_total ?? 0) > 0}
          hasDestination={(destinations.data ?? []).some((d) => d.verified_at)}
        />
      ) : null}

      {overview.isError ? (
        <ErrorState error={overview.error} title="Couldn't load your overview" onRetry={() => void overview.refetch()} />
      ) : !o ? (
        <KpiTilesSkeleton />
      ) : (
        <KpiTiles overview={o} />
      )}

      {o ? <ActivityChart series={o.series} /> : !overview.isError ? <Skeleton className="h-[372px] rounded-xl" /> : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <LiveFeed />
        {o && mailboxes.data ? (
          <HealthCard waha={(o.waha ?? {}) as WahaHealth} mailboxes={mailboxes.data} />
        ) : (
          <Skeleton className="h-80 rounded-xl" />
        )}
      </div>

      <RecentSent />
    </div>
  );
}
