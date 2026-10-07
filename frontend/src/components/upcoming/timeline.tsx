"use client";

import type { EventItem } from "@/lib/api/types";
import { groupEvents } from "@/lib/events";
import { useNow } from "@/lib/hooks/use-now";
import { useZone } from "@/lib/hooks/use-zone";
import { cn } from "@/lib/utils";
import { EventCard } from "./event-card";
import { kindMeta } from "./event-kinds";

/** Upcoming (confirmed) events grouped into Today / Tomorrow / This week / Later. */
export function Timeline({ events, nextId }: { events: EventItem[]; nextId?: string }) {
  const zone = useZone();
  const now = useNow();
  if (!now) return null;
  const groups = groupEvents(events, zone, now);

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`tl-${g.id}`} className="relative">
          <div className="sticky top-14 z-10 -mx-1 mb-3 flex items-center gap-2 bg-background px-1 py-1.5">
            <h2 id={`tl-${g.id}`} className="text-sm font-semibold tracking-tight">
              {g.label}
            </h2>
            <span className="rounded-md bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular">{g.events.length}</span>
            <div aria-hidden className="h-px flex-1 bg-border" />
          </div>
          <ol className="relative space-y-3 border-l border-dashed border-border pl-4 sm:pl-5">
            {g.events.map((e) => (
              <li key={e.id} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-6 -left-[21px] size-2.5 rounded-full ring-2 ring-background sm:-left-[25px]",
                    kindMeta(e.kind).dot,
                  )}
                />
                <EventCard event={e} next={e.id === nextId} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
