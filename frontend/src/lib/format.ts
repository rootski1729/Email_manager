const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 min ago" / "in 2 days". `now` is passed in so render stays pure. */
export function relativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  if (!now) return absoluteTime(iso);
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return diff <= 0 ? "just now" : "in a moment";
  for (const [unit, secs] of UNITS) {
    if (abs >= secs || unit === "minute") {
      return rtf.format(Math.round(diff / secs), unit);
    }
  }
  return rtf.format(diff, "second");
}

const absFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : absFmt.format(d);
}

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function shortDay(isoDate: string): string {
  // DayStat.date is a plain YYYY-MM-DD in UTC; anchor at noon to avoid TZ drift.
  const d = new Date(`${isoDate}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? isoDate : shortDate.format(d);
}

const nf = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(n: number | null | undefined): string {
  return n == null ? "—" : nf.format(n);
}

export function formatCompact(n: number | null | undefined): string {
  return n == null ? "—" : n < 10_000 ? nf.format(n) : compact.format(n);
}

export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null) return "—";
  return `${(ratio * 100).toFixed(ratio === 1 || ratio === 0 ? 0 : digits)}%`;
}

/** WhatsApp chat ids look like 9198xxxxxx@c.us or 1203...@g.us. */
export function chatIdToDisplay(chatId: string): string {
  const [user, server] = chatId.split("@");
  if (server === "g.us") return "WhatsApp group";
  return /^\d+$/.test(user) ? `+${user}` : chatId;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.length < 7) return digits;
  return `${digits.slice(0, digits.length - 7)} ••• ${digits.slice(-4)}`;
}

export function initials(name: string | null | undefined, fallback = "?"): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
