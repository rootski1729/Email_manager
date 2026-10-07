"use client";

import { Clock, Timer } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EventItem } from "@/lib/api/types";
import { countdown, eventAbsolute, eventDate, eventTime } from "@/lib/events";
import { useNow } from "@/lib/hooks/use-now";
import { useZone } from "@/lib/hooks/use-zone";
import { cn } from "@/lib/utils";

/** "Mon, 12 Oct · 10:00 AM" with the full date and zone in a tooltip. */
export function EventWhen({ event, className, showCountdown = true }: { event: EventItem; className?: string; showCountdown?: boolean }) {
  const zone = useZone();
  const now = useNow();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={event.starts_at}
          tabIndex={0}
          className={cn(
            "inline-flex min-w-0 flex-wrap items-center gap-x-1.5 rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          suppressHydrationWarning
        >
          <span className="font-medium text-foreground">{now ? eventDate(event, zone, now) : ""}</span>
          <span aria-hidden className="text-muted-foreground/60">
            ·
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground tabular">
            <Clock className="size-3.5" aria-hidden />
            {eventTime(event, zone)}
          </span>
          {showCountdown && now ? (
            <span className="text-muted-foreground">({countdown(event, zone, now).toLowerCase()})</span>
          ) : null}
        </time>
      </TooltipTrigger>
      <TooltipContent>{eventAbsolute(event, zone)}</TooltipContent>
    </Tooltip>
  );
}

/** Prominent countdown pill for the next item, e.g. "in 2 days". */
export function CountdownChip({ event, className }: { event: EventItem; className?: string }) {
  const zone = useZone();
  const now = useNow();
  if (!now) return null;
  const text = countdown(event, zone, now);
  const soon = new Date(event.starts_at).getTime() - now < 24 * 3600_000;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold tabular shadow-xs ring-1 ring-inset",
        soon
          ? "bg-destructive/10 text-destructive ring-destructive/25"
          : "bg-brand/15 text-brand-ink ring-brand/35",
        className,
      )}
    >
      <Timer className={cn("size-3.5", soon && "motion-safe:animate-pulse")} aria-hidden />
      {text}
    </span>
  );
}
