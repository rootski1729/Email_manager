import { ArrowDown, ArrowUp, CalendarClock, Mail, MessageCircle, Send, type LucideIcon } from "lucide-react";
import Link from "next/link";

import type { DashboardStats } from "@/lib/api/types";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const CHIP = {
  iris: "bg-tint-iris text-tint-iris-ink",
  green: "bg-tint-green text-tint-green-ink",
  amber: "bg-tint-amber text-tint-amber-ink",
  teal: "bg-tint-teal text-tint-teal-ink",
} as const;

/** "↑ 12%" (green) / "↓ 8%" (rose) against the previous period; "New" or "–" when there was nothing before. */
function Change({ now, prev, days }: { now: number; prev: number; days: number }) {
  const against = <span className="whitespace-nowrap text-muted-foreground">vs previous {days} days</span>;
  if (prev === 0) {
    return (
      <span className="block text-xs">
        {now > 0 ? <span className="font-medium text-tint-green-ink">New</span> : <span className="text-muted-foreground">–</span>}{" "}
        {against}
      </span>
    );
  }
  const pct = Math.round(((now - prev) / prev) * 100);
  const up = pct > 0;
  const down = pct < 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span className="block text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium tabular",
          up ? "text-tint-green-ink" : down ? "text-tint-rose-ink" : "text-muted-foreground",
        )}
      >
        {up || down ? <Arrow className="size-3" strokeWidth={2.5} aria-hidden /> : null}
        <span className="sr-only">{up ? "up" : down ? "down" : "no change,"}</span>
        {Math.abs(pct)}%
      </span>{" "}
      {against}
    </span>
  );
}

function Kpi({
  icon: Icon,
  tint,
  value,
  label,
  href,
  foot,
}: {
  icon: LucideIcon;
  tint: keyof typeof CHIP;
  value: number;
  label: string;
  href: string;
  foot: React.ReactNode;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className="lift group flex h-full flex-col gap-3 rounded-2xl bg-card p-4 shadow-xs ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
      >
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-transform duration-200 ease-(--ease-soft) group-hover:scale-105 motion-reduce:group-hover:scale-100 sm:size-14",
            CHIP[tint],
          )}
        >
          <Icon className="size-5 sm:size-6" aria-hidden />
        </span>
        <span className="min-w-0 space-y-0.5">
          <span className="block text-2xl leading-none font-bold tracking-tight tabular sm:text-[1.75rem]">
            {formatCompact(value)}
          </span>
          <span className="block pt-1 text-sm text-muted-foreground">{label}</span>
          <span className="block pt-0.5">{foot}</span>
        </span>
      </Link>
    </li>
  );
}

/** Four headline numbers for the period, each against the period before. */
export function KpiCards({ stats }: { stats: DashboardStats }) {
  const days = stats.period_days;
  return (
    <ul className="stagger grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="This period in numbers">
      <Kpi
        icon={Mail}
        tint="iris"
        value={stats.important}
        label="Important emails"
        href="/messages"
        foot={<Change now={stats.important} prev={stats.important_prev} days={days} />}
      />
      <Kpi
        icon={MessageCircle}
        tint="green"
        value={stats.alerts}
        label="WhatsApp alerts"
        href="/deliveries"
        foot={<Change now={stats.alerts} prev={stats.alerts_prev} days={days} />}
      />
      <Kpi
        icon={CalendarClock}
        tint="amber"
        value={stats.upcoming}
        label="Coming up"
        href="/upcoming"
        foot={<span className="block text-xs text-muted-foreground">next 30 days</span>}
      />
      <Kpi
        icon={Send}
        tint="teal"
        value={stats.emails_sent}
        label="Emails sent"
        href="/sent"
        foot={<Change now={stats.emails_sent} prev={stats.emails_sent_prev} days={days} />}
      />
    </ul>
  );
}
