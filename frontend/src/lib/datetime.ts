/**
 * Time-zone aware helpers for the deadline radar. The backend stores all-day
 * events as midnight in the user's profile time zone and schedules reminders
 * in that zone, so the UI groups and formats dates in that zone too (not the
 * browser's, which can differ while travelling).
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = partsCache.get(zone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        weekday: "short",
        hourCycle: "h23",
      });
    } catch {
      f = partsFormatter("UTC");
    }
    partsCache.set(zone, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(date: Date | string | number, zone: string): ZonedParts {
  const d = date instanceof Date ? date : new Date(date);
  const map: Record<string, string> = {};
  for (const p of partsFormatter(zone).formatToParts(d)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    weekday: Math.max(0, WEEKDAYS.indexOf(map.weekday)),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-12": the calendar day of an instant in the given zone. */
export function dayKey(date: Date | string | number, zone: string): string {
  const p = zonedParts(date, zone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "14:30" in the given zone, for <input type="time">. */
export function timeKey(date: Date | string | number, zone: string): string {
  const p = zonedParts(date, zone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Whole days between two YYYY-MM-DD keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * The UTC instant for a wall-clock time in a zone: "2026-10-12" + "10:00" in
 * Asia/Kolkata → 2026-10-12T04:30:00.000Z. Two passes handle DST edges.
 */
export function zonedToUtc(day: string, time: string, zone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(guess, zone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wall - seen;
  }
  return new Date(guess);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

export function formatInZone(date: Date | string | number, zone: string, opts: Intl.DateTimeFormatOptions): string {
  const key = `${zone}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: zone });
    } catch {
      f = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: "UTC" });
    }
    fmtCache.set(key, f);
  }
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? "—" : f.format(d);
}

/** Format a YYYY-MM-DD key without any zone shifting. */
export function formatDayKey(key: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = key.split("-").map(Number);
  return formatInZone(new Date(Date.UTC(y, m - 1, d, 12)), "UTC", opts);
}

export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
