"use client";

import { PageHeader } from "@/components/common/page-header";
import { useNow } from "@/lib/hooks/use-now";
import { useZone } from "@/lib/hooks/use-zone";
import { zonedParts } from "@/lib/datetime";
import { useAuth } from "@/lib/auth/auth-provider";
import { AskBox } from "./ask-box";
import { ComingUp } from "./coming-up";
import { ImportantToday } from "./important-today";
import { Onboarding } from "./onboarding";
import { QuickActions } from "./quick-actions";
import { StatusLine } from "./status-line";
import { WeekSummary } from "./week-summary";

function useGreeting(name?: string | null) {
  const now = useNow();
  const zone = useZone();
  const first = name?.trim().split(/\s+/)[0];
  const hour = now ? zonedParts(now, zone).hour : 12;
  const part = hour < 5 ? "Hello" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return first ? `${part}, ${first}` : part;
}

export function DashboardView() {
  const { user } = useAuth();
  const greeting = useGreeting(user?.display_name);

  return (
    <div className="space-y-6">
      <PageHeader
        title={greeting}
        description="Here's what's happening with your important email."
        className="pb-0"
      />
      <StatusLine />
      <Onboarding />
      <QuickActions />
      <AskBox />
      <div className="grid items-start gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <ImportantToday />
        <div className="space-y-6">
          <ComingUp />
          <WeekSummary />
        </div>
      </div>
    </div>
  );
}
