"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarOff, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { TimelineSkeleton } from "@/components/common/skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { eventsQuery } from "@/lib/api/deadlines";
import { settingsQuery, useUpdateSettings } from "@/lib/api/queries";
import type { EventItem } from "@/lib/api/types";
import { dayKey, daysBetween, formatDayKey } from "@/lib/datetime";
import { useNow } from "@/lib/hooks/use-now";
import { useZone } from "@/lib/hooks/use-zone";
import { CalendarFeedCard } from "./calendar-feed-card";
import { EventDialog } from "./event-dialog";
import { MiniCalendar } from "./mini-calendar";
import { SuggestionsSection } from "./suggestions-section";
import { Timeline } from "./timeline";
import { UpcomingEmpty } from "./upcoming-empty";

function nextUpcoming(events: EventItem[], zone: string, now: number): EventItem | undefined {
  const today = dayKey(now, zone);
  return events.find((e) =>
    e.all_day ? daysBetween(today, dayKey(e.starts_at, zone)) >= 0 : new Date(e.starts_at).getTime() >= now,
  );
}

function RadarOffBanner() {
  const update = useUpdateSettings();
  return (
    <Alert>
      <CalendarOff />
      <AlertTitle>Finding dates is switched off</AlertTitle>
      <AlertDescription>
        <p>We won&apos;t look for new dates in your email. Dates already here still get reminders.</p>
        <Button
          size="sm"
          className="mt-2"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({ deadlines_enabled: true }, { onSuccess: () => toast.success("We'll look for dates again") })
          }
        >
          {update.isPending ? <Spinner /> : null} Turn it on
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function UpcomingView() {
  const events = useQuery(eventsQuery());
  const settings = useQuery(settingsQuery);
  const zone = useZone();
  const now = useNow();
  const [adding, setAdding] = useState<{ key: number; date?: string } | null>(null);
  const [day, setDay] = useState<string | null>(null);

  const { suggested, upcoming } = useMemo(() => {
    const all = [...(events.data ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return {
      suggested: all.filter((e) => e.status === "suggested"),
      upcoming: all.filter((e) => e.status === "upcoming"),
    };
  }, [events.data]);
  const shown = day ? upcoming.filter((e) => dayKey(e.starts_at, zone) === day) : upcoming;
  const next = now ? nextUpcoming(upcoming, zone, now) : undefined;
  const weekCount = now
    ? upcoming.filter((e) => {
        const d = daysBetween(dayKey(now, zone), dayKey(e.starts_at, zone));
        return d >= 0 && d < 7;
      }).length
    : 0;
  const openAdd = (date?: string) => setAdding({ key: Date.now(), date });
  const isEmpty = events.isSuccess && suggested.length === 0 && upcoming.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upcoming"
        description="Exams, interviews and due dates from your important email. We remind you on WhatsApp before each one."
        actions={
          <Button onClick={() => openAdd()}>
            <Plus /> Add a date
          </Button>
        }
        className="pb-0"
      >
        {events.isSuccess && !isEmpty ? (
          <p className="pt-1 text-sm font-medium text-foreground/80" aria-live="polite">
            {weekCount ? `${weekCount} in the next 7 days` : `${upcoming.length} coming up`}
            {suggested.length ? ` · ${suggested.length} to confirm` : ""}
          </p>
        ) : null}
      </PageHeader>

      {settings.data && !settings.data.deadlines_enabled ? <RadarOffBanner /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
          {events.isPending ? (
            <TimelineSkeleton />
          ) : events.isError ? (
            <ErrorState error={events.error} title="Couldn't load your upcoming dates" onRetry={() => void events.refetch()} />
          ) : isEmpty ? (
            <UpcomingEmpty onAdd={() => openAdd()} />
          ) : (
            <div className="animate-rise space-y-6">
              <SuggestionsSection events={suggested} />
              {day ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Showing</span>
                  <span className="font-medium">{formatDayKey(day, { weekday: "long", day: "numeric", month: "long" })}</span>
                  <Button variant="ghost" size="icon-xs" aria-label="Show all days" onClick={() => setDay(null)}>
                    <X />
                  </Button>
                </div>
              ) : null}
              {shown.length ? (
                <Timeline events={shown} nextId={next?.id} />
              ) : (
                <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {day
                    ? "Nothing confirmed on this day."
                    : "No confirmed dates yet. Confirm a suggestion above, or add one yourself."}
                </p>
              )}
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Calendar and help">
          <div className="hidden lg:block">
            {events.data ? (
              <MiniCalendar events={[...suggested, ...upcoming]} selected={day} onSelect={setDay} />
            ) : (
              <Skeleton className="h-80 rounded-2xl" />
            )}
          </div>
          <CalendarFeedCard />
        </aside>
      </div>

      {adding ? (
        <EventDialog
          key={adding.key}
          open
          onOpenChange={(o) => !o && setAdding(null)}
          defaults={adding.date ? { date: adding.date } : undefined}
        />
      ) : null}
    </div>
  );
}
