"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRealtime } from "@/lib/realtime/realtime-provider";
import { cn } from "@/lib/utils";

const COPY = {
  open: { label: "Live", hint: "This page updates by itself as new emails arrive.", dot: "bg-success" },
  connecting: { label: "Connecting", hint: "Connecting for live updates…", dot: "bg-info" },
  reconnecting: { label: "Reconnecting", hint: "Live updates paused for a moment. Retrying…", dot: "bg-warning" },
  offline: { label: "Offline", hint: "Live updates are off. The page refreshes when you come back.", dot: "bg-muted-foreground" },
} as const;

/** Small "Live" pill: reassures that the page updates itself, and says so plainly when it can't. */
export function ConnectionIndicator() {
  const { connection } = useRealtime();
  const c = COPY[connection];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
          role="status"
          aria-live="polite"
        >
          <span
            className={cn("size-1.5 rounded-full", c.dot, connection === "open" && "animate-ping-soft text-success")}
          />
          <span className="hidden sm:inline">{c.label}</span>
          <span className="sr-only sm:hidden">{c.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{c.hint}</TooltipContent>
    </Tooltip>
  );
}
