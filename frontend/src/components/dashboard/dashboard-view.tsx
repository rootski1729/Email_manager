"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";

import { ErrorState } from "@/components/common/error-state";
import { ChartRowsSkeleton, KpiRowSkeleton } from "@/components/common/skeletons";
import { useAiAvailable } from "@/lib/api/ai";
import { dashboardQuery } from "@/lib/api/queries";
import { useAuth } from "@/lib/auth/auth-provider";
import { cn } from "@/lib/utils";
import { AskBox } from "./ask-box";
import { ActivityChart, ImportantChart, TopicChart } from "./charts";
import { ComingUp } from "./coming-up";
import { GlanceCard } from "./glance-card";
import { KpiCards } from "./kpi-cards";
import { LatestCarousel } from "./latest-carousel";
import { Onboarding } from "./onboarding";
import { type Period, PeriodFilter } from "./period-filter";
import { StatusLine } from "./status-line";

/** "Ask about your mail", given its own card so it reads as the assistant rather than another search box. */
function AskCard() {
  const available = useAiAvailable();
  if (!available) return null;
  return (
    <section
      aria-labelledby="ask-title"
      className="animate-rise rounded-2xl bg-card p-4 shadow-xs ring-1 ring-border sm:p-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
        <div className="flex shrink-0 items-center gap-3 lg:h-12 lg:w-72">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint-iris text-tint-iris-ink">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="ask-title" className="text-base font-semibold tracking-tight">
              Ask about your mail
            </h2>
            <p className="text-xs text-muted-foreground">Answers come from your important emails.</p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <AskBox />
        </div>
      </div>
    </section>
  );
}

export function DashboardView() {
  const { user } = useAuth();
  const first = user?.display_name?.trim().split(/\s+/)[0];
  const [days, setDays] = useState<Period>(7);
  const stats = useQuery(dashboardQuery(days));
  const data = stats.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[1.7rem] leading-tight font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="text-[0.95rem] text-muted-foreground text-pretty">
            {first ? `Hi ${first}, here's your important email.` : "Here's your important email."}
          </p>
        </div>
        <PeriodFilter days={days} onChange={setDays} />
      </div>

      <StatusLine />

      {stats.isError && !data ? (
        <ErrorState error={stats.error} title="Couldn't load your numbers" onRetry={() => void stats.refetch()} />
      ) : null}

      {/* While a new period loads, the old numbers stay on screen, slightly dimmed. */}
      <div
        className={cn("space-y-6 transition-opacity duration-200", stats.isPlaceholderData && "opacity-60")}
        aria-busy={stats.isFetching && stats.isPlaceholderData}
      >
        {data ? <KpiCards stats={data} /> : stats.isPending ? <KpiRowSkeleton /> : null}
        <AskCard />
        <Onboarding />
        {data ? (
          <>
            <div className="grid gap-6 xl:grid-cols-12">
              <GlanceCard stats={data} className="xl:col-span-5" />
              <ImportantChart stats={data} className="xl:col-span-7" />
            </div>
            <div className="grid gap-6 xl:grid-cols-12">
              <ActivityChart stats={data} className="xl:col-span-7" />
              <TopicChart stats={data} className="xl:col-span-5" />
            </div>
          </>
        ) : stats.isPending ? (
          <ChartRowsSkeleton />
        ) : null}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-12">
        <LatestCarousel className="xl:col-span-8" />
        <ComingUp className="xl:col-span-4" />
      </div>
    </div>
  );
}
