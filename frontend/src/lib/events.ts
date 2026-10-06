import type { EventItem } from "@/lib/api/types";
import { daysBetween, dayKey, formatInZone } from "@/lib/datetime";

export type TimelineGroupId = "past" | "today" | "tomorrow" | "week" | "later";

export const TIMELINE_GROUPS: { id: TimelineGroupId; label: string }[] = [
  { id: "past", label: "Just passed" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This week" },
  { id: "later", label: "Later" },
];

export function groupFor(e: EventItem, todayKey: string, zone: string, now: number): TimelineGroupId {
  const diff = daysBetween(todayKey, dayKey(e.starts_at, zone));
  if (diff < 0) return "past";
  if (diff === 0) {
    // A timed event that already started today still belongs to Today until it is marked done.
    return !e.all_day && new Date(e.starts_at).getTime() < now - 3 * 3600_000 ? "past" : "today";
  }
  if (diff === 1) return "tomorrow";
  if (diff < 7) return "week";
  return "later";
}

export function groupEvents(events: EventItem[], zone: string, now: number) {
  const today = dayKey(now, zone);
  const out = new Map<TimelineGroupId, EventItem[]>();
  for (const e of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const g = groupFor(e, today, zone, now);
    out.set(g, [...(out.get(g) ?? []), e]);
  }
  return TIMELINE_GROUPS.filter((g) => out.has(g.id)).map((g) => ({ ...g, events: out.get(g.id) ?? [] }));
}

/** Short countdown for a chip: "Today", "Tomorrow", "in 3 days", "in 2 h", "now". */
export function countdown(e: EventItem, zone: string, now: number): string {
  const start = new Date(e.starts_at).getTime();
  const diffDays = daysBetween(dayKey(now, zone), dayKey(start, zone));
  if (e.all_day || Math.abs(start - now) >= 24 * 3600_000) {
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays < 0) return `${-diffDays} days ago`;
    if (diffDays < 14) return `in ${diffDays} days`;
    const weeks = Math.round(diffDays / 7);
    return diffDays < 60 ? `in ${weeks} weeks` : `in ${Math.round(diffDays / 30)} months`;
  }
  const mins = Math.round((start - now) / 60_000);
  if (diffDays === 1 && mins >= 12 * 60) return "Tomorrow";
  if (Math.abs(mins) < 2) return "now";
  if (mins < 0) return mins > -60 ? `${-mins} min ago` : `${Math.round(-mins / 60)} h ago`;
  if (mins < 60) return `in ${mins} min`;
  return `in ${Math.round(mins / 60)} h`;
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
const DATE_YEAR_OPTS: Intl.DateTimeFormatOptions = { ...DATE_OPTS, year: "numeric" };
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/** "Mon, 12 Oct" (+ year when not this year). */
export function eventDate(e: EventItem, zone: string, now: number): string {
  const sameYear = dayKey(e.starts_at, zone).slice(0, 4) === dayKey(now, zone).slice(0, 4);
  return formatInZone(e.starts_at, zone, sameYear ? DATE_OPTS : DATE_YEAR_OPTS);
}

/** "All day" or "10:00 AM – 11:30 AM". */
export function eventTime(e: EventItem, zone: string): string {
  if (e.all_day) return "All day";
  const start = formatInZone(e.starts_at, zone, TIME_OPTS);
  if (e.ends_at && dayKey(e.ends_at, zone) === dayKey(e.starts_at, zone) && e.ends_at !== e.starts_at) {
    return `${start} – ${formatInZone(e.ends_at, zone, TIME_OPTS)}`;
  }
  return start;
}

/** Full absolute description for tooltips and screen readers. */
export function eventAbsolute(e: EventItem, zone: string): string {
  const day = formatInZone(e.starts_at, zone, { dateStyle: "full" });
  return e.all_day ? `${day} (all day)` : `${day}, ${formatInZone(e.starts_at, zone, TIME_OPTS)} (${zone})`;
}

/** When WhatsApp reminders go out, mirroring backend app/services/deadlines.py reminder_times(). */
export function reminderPlan(e: EventItem): string {
  return e.all_day ? "Reminders at 18:00 the evening before and 07:30 that morning" : "Reminders 1 day and 2 hours before";
}

export function confidenceLabel(c: number): { label: string; tone: "warning" | "neutral" | "info" } {
  if (c >= 0.75) return { label: "Likely", tone: "info" };
  if (c >= 0.5) return { label: "Possible", tone: "warning" };
  return { label: "Unsure", tone: "neutral" };
}

/** Set of YYYY-MM-DD keys with at least one event, for calendar dots. */
export function eventDays(events: EventItem[], zone: string): Map<string, EventItem[]> {
  const out = new Map<string, EventItem[]>();
  for (const e of events) {
    const k = dayKey(e.starts_at, zone);
    out.set(k, [...(out.get(k) ?? []), e]);
  }
  return out;
}
