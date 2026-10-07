"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventItem } from "@/lib/api/types";
import { addDays, dayKey, formatDayKey } from "@/lib/datetime";
import { eventDays } from "@/lib/events";
import { useNow } from "@/lib/hooks/use-now";
import { useZone } from "@/lib/hooks/use-zone";
import { cn } from "@/lib/utils";
import { kindMeta } from "./event-kinds";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function monthGrid(year: number, month: number): string[] {
  // Monday-first 6x7 grid of YYYY-MM-DD keys covering the month.
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const dow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
  const start = addDays(first, -((dow + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/**
 * Month view with a dot per event kind on each day. Arrow keys move between
 * days (roving focus); Enter selects a day to filter the timeline.
 */
export function MiniCalendar({
  events,
  selected,
  onSelect,
}: {
  events: EventItem[];
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const zone = useZone();
  const now = useNow();
  const today = now ? dayKey(now, zone) : null;
  const [offset, setOffset] = useState(0);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const base = today ?? dayKey(new Date(0), "UTC");
  const [ty, tm] = base.split("-").map(Number);
  const year = ty + Math.floor((tm - 1 + offset) / 12);
  const month = ((((tm - 1 + offset) % 12) + 12) % 12) + 1;
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const byDay = useMemo(() => eventDays(events, zone), [events, zone]);
  const tabStop =
    [focusKey, selected, today].find((k): k is string => Boolean(k?.startsWith(monthPrefix))) ?? `${monthPrefix}-01`;

  if (!today) return null;

  function moveFocus(key: string) {
    const [y, m] = key.split("-").map(Number);
    const diff = (y - year) * 12 + (m - month);
    if (diff) setOffset((o) => o + diff);
    setFocusKey(key);
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${key}"]`)?.focus());
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm" aria-live="polite">
          {formatDayKey(`${monthPrefix}-15`, { month: "long", year: "numeric" })}
        </CardTitle>
        <div className="flex items-center gap-1">
          {offset !== 0 ? (
            <Button variant="ghost" size="xs" onClick={() => setOffset(0)}>
              Today
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setOffset((o) => o + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground" aria-hidden>
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div
          ref={gridRef}
          role="group"
          aria-label="Days with events"
          className="grid grid-cols-7 gap-0.5"
          onKeyDown={(e) => {
            const target = (e.target as HTMLElement).dataset.day;
            if (!target) return;
            const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
            if (step) {
              e.preventDefault();
              moveFocus(addDays(target, step));
            }
          }}
        >
          {days.map((key) => {
            const inMonth = key.startsWith(monthPrefix);
            const items = byDay.get(key) ?? [];
            const kinds = [...new Set(items.map((e) => e.kind))].slice(0, 3);
            const isToday = key === today;
            const isSelected = key === selected;
            const label = `${formatDayKey(key, { weekday: "long", day: "numeric", month: "long" })}${
              items.length ? `, ${items.length} event${items.length > 1 ? "s" : ""}` : ""
            }`;
            return (
              <button
                key={key}
                type="button"
                data-day={key}
                tabIndex={key === tabStop ? 0 : -1}
                aria-label={label}
                aria-pressed={isSelected}
                aria-disabled={items.length === 0 && !isSelected ? true : undefined}
                onClick={() => {
                  if (items.length || isSelected) onSelect(isSelected ? null : key);
                }}
                onFocus={() => setFocusKey(key)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs tabular outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-default",
                  !inMonth && "text-muted-foreground/40",
                  inMonth && items.length === 0 && "text-muted-foreground",
                  items.length > 0 && "font-semibold text-foreground hover:bg-muted",
                  isToday && !isSelected && "bg-accent text-brand-ink",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {Number(key.slice(8))}
                {kinds.length ? (
                  <span className="absolute bottom-1 flex gap-0.5" aria-hidden>
                    {kinds.map((k) => (
                      <span
                        key={k}
                        className={cn("size-1 rounded-full", isSelected ? "bg-primary-foreground" : kindMeta(k).dot)}
                      />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {selected ? (
          <Button variant="link" size="xs" className="mt-2 h-auto px-0" onClick={() => onSelect(null)}>
            Show all days
          </Button>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Pick a highlighted day to see only its events.</p>
        )}
      </CardContent>
    </Card>
  );
}
