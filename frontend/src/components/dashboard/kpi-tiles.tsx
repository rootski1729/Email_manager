import { CheckCircle2, Inbox, ListFilter, MailCheck, Timer, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Overview } from "@/lib/api/types";
import { formatCompact, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className="truncate text-xs font-medium">{label}</span>
        <Icon className={cn("size-4 shrink-0", tone === "warn" && "text-amber-500")} aria-hidden />
      </div>
      <div>
        <div className="text-2xl font-semibold tracking-tight tabular">{value}</div>
        {sub ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div> : null}
      </div>
    </div>
  );
}

export function KpiTiles({ overview }: { overview: Overview }) {
  const mb = overview.mailboxes ?? {};
  const totalMailboxes = Object.values(mb).reduce((a, b) => a + (b ?? 0), 0);
  const active = mb.active ?? 0;
  const n24 = overview.notifications_24h ?? {};
  const sent24 = (n24.sent ?? 0) + (n24.delivered ?? 0) + (n24.read ?? 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Tile icon={MailCheck} label="Matched today" value={formatCompact(overview.matched_today)} sub="emails that hit a rule" />
      <Tile icon={TrendingUp} label="Matched (7d)" value={formatCompact(overview.matched_7d)} sub={`${formatCompact(sent24)} ${sent24 === 1 ? "alert" : "alerts"} sent in 24 h`} />
      <Tile
        icon={CheckCircle2}
        label="Delivery rate (7d)"
        value={formatPercent(overview.delivery_rate_7d)}
        sub={overview.delivery_rate_7d == null ? "no alerts yet" : "sent, delivered or read"}
      />
      <Tile
        icon={Timer}
        label="Queue depth"
        value={formatCompact(overview.queue_depth)}
        sub={overview.queue_depth > 0 ? "alerts waiting to send" : "all caught up"}
        tone={overview.queue_depth > 20 ? "warn" : undefined}
      />
      <Tile icon={Inbox} label="Active mailboxes" value={`${active}`} sub={`of ${totalMailboxes} connected`} />
      <Tile icon={ListFilter} label="Rules enabled" value={`${overview.rules_enabled}`} sub={`of ${overview.rules_total} total`} />
    </div>
  );
}

export function KpiTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-[104px] rounded-xl" />
      ))}
    </div>
  );
}
