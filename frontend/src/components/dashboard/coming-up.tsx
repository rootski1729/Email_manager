"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock } from "lucide-react";
import Link from "next/link";

import { MailRowsSkeleton } from "@/components/common/skeletons";
import { CountdownChip, EventWhen } from "@/components/upcoming/event-when";
import { kindMeta } from "@/components/upcoming/event-kinds";
import { Card } from "@/components/ui/card";
import { eventsQuery } from "@/lib/api/deadlines";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

/** The next three confirmed dates found in important email. */
export function ComingUp({ className }: { className?: string }) {
  const events = useQuery(eventsQuery());
  const all = [...(events.data ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const upcoming = all.filter((e) => e.status === "upcoming").slice(0, 3);

  return (
    <Card className={cn("gap-2 py-3", className)}>
      <div className="px-4 pt-1">
        <h2 className="text-base font-semibold tracking-tight">Coming up</h2>
        <p className="text-sm text-muted-foreground">Dates from your email. We&apos;ll remind you on WhatsApp.</p>
      </div>
      <div className="px-1">
        {events.isPending ? (
          <MailRowsSkeleton rows={3} square />
        ) : events.isError ? (
          <p className="px-3 py-4 text-sm text-destructive">{errorMessage(events.error)}</p>
        ) : upcoming.length === 0 ? (
          <div className="flex animate-rise flex-col items-center gap-2 px-4 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-xl bg-tint-teal text-tint-teal-ink">
              <CalendarClock className="size-5" aria-hidden />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground text-pretty">
              Nothing coming up. When an email mentions an exam, interview or due date, it shows up here.
            </p>
          </div>
        ) : (
          <ul className="stagger">
            {upcoming.map((e, i) => {
              const meta = kindMeta(e.kind);
              return (
                <li key={e.id} className="relative flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-muted/70 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", meta.tile)}>
                      <meta.icon className="size-4" aria-hidden />
                      <span className="sr-only">{meta.label}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          href={`/upcoming#event-${e.id}`}
                          className="min-w-0 truncate text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-xl"
                        >
                          {e.title}
                        </Link>
                        {i === 0 ? <CountdownChip event={e} /> : null}
                      </div>
                      <EventWhen event={e} className="relative z-10 text-xs" showCountdown={i !== 0} />
                    </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t px-4 pt-3">
        <Link
          href="/upcoming"
          className="group/more inline-flex items-center gap-1 rounded-md text-sm font-medium text-brand-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          See everything coming up{" "}
          <ArrowRight className="size-4 transition-transform duration-200 group-hover/more:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}
