"use client";

import { CalendarDays, ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addDays, dayKey, formatDayKey } from "@/lib/datetime";
import { useNow } from "@/lib/hooks/use-now";
import { useZone } from "@/lib/hooks/use-zone";

export const PERIODS = [7, 14, 30] as const;
export type Period = (typeof PERIODS)[number];

/** "25 Sep – 8 Oct 2026": the days the dashboard covers (today and the `days - 1` before it). */
export function usePeriodRange(days: number): string {
  const now = useNow();
  const zone = useZone();
  if (!now) return "";
  const end = dayKey(now, zone);
  const start = addDays(end, -(days - 1));
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const from = formatDayKey(start, sameYear ? { day: "numeric", month: "short" } : { dateStyle: "medium" });
  return `${from} – ${formatDayKey(end, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** The "Filter period" card button: a calendar chip, the period and its dates, and a chevron. */
export function PeriodFilter({ days, onChange }: { days: Period; onChange: (days: Period) => void }) {
  const range = usePeriodRange(days);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="lift group flex w-full items-center gap-3 rounded-2xl bg-card py-2.5 pr-3.5 pl-2.5 text-left shadow-xs ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto sm:min-w-64"
          aria-label={`Period: last ${days} days${range ? `, ${range}` : ""}. Change period`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tint-iris text-tint-iris-ink">
            <CalendarDays className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Last {days} days</span>
            <span className="block truncate text-xs text-muted-foreground tabular" suppressHydrationWarning>
              {range || " "}
            </span>
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-(--radix-dropdown-menu-trigger-width) min-w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Filter period</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={String(days)} onValueChange={(v) => onChange(Number(v) as Period)}>
          {PERIODS.map((p) => (
            <DropdownMenuRadioItem key={p} value={String(p)}>
              Last {p} days
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
