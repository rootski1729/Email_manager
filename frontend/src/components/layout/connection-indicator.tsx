"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRealtime } from "@/lib/realtime/realtime-provider";
import { cn } from "@/lib/utils";

const COPY = {
  open: { label: "Live", hint: "Receiving updates in real time.", dot: "bg-emerald-500" },
  connecting: { label: "Connecting", hint: "Opening the live update stream…", dot: "bg-sky-500" },
  reconnecting: { label: "Reconnecting", hint: "Live updates paused; retrying with backoff.", dot: "bg-amber-500" },
  offline: { label: "Offline", hint: "Live updates are unavailable. Data refreshes when you return.", dot: "bg-muted-foreground" },
} as const;

export function ConnectionIndicator() {
  const { connection } = useRealtime();
  const c = COPY[connection];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              c.dot,
              connection === "open" && "animate-ping-soft text-emerald-500",
            )}
          />
          <span className="hidden sm:inline">{c.label}</span>
          <span className="sr-only sm:hidden">{c.label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{c.hint}</TooltipContent>
    </Tooltip>
  );
}
