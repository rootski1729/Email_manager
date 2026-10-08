import type { DashboardStats } from "@/lib/api/types";
import { DashCard } from "./dash-card";

const R = 42;
const LEN = 2 * Math.PI * R;

/** One ring: the share drawn as an arc over a faint track of the same colour, the % in the middle. */
function Ring({ value, color, label, hint }: { value: number | null; color: string; label: string; hint: string }) {
  const v = value == null ? 0 : Math.min(1, Math.max(0, value));
  const pct = value == null ? "–" : `${Math.round(v * 100)}%`;
  return (
    <figure className="flex min-w-0 flex-1 flex-col items-center gap-2.5 text-center">
      <div className="relative size-[5.5rem] sm:size-28">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="10"
            style={{ stroke: `color-mix(in oklab, ${color} 15%, transparent)` }}
          />
          {v > 0 ? (
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={LEN}
              strokeDashoffset={LEN * (1 - v)}
              className="animate-ring"
              style={{ stroke: color, ["--ring-len" as string]: LEN }}
            />
          ) : null}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tracking-tight tabular sm:text-xl">
          {pct}
        </span>
      </div>
      <figcaption className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground text-pretty">{hint}</span>
      </figcaption>
    </figure>
  );
}

/** Three rates as donut rings: alerts that went out, alerts that were read, important emails with a summary. */
export function GlanceCard({ stats, className }: { stats: DashboardStats; className?: string }) {
  const nothing = stats.delivery_rate == null && stats.read_rate == null && stats.summarized_rate == null;
  return (
    <DashCard
      id="glance"
      title="At a glance"
      description={`How the last ${stats.period_days} days went.`}
      className={className}
    >
      <div className="flex flex-1 items-center sm:px-2">
      <div className="flex w-full items-start justify-between gap-2 sm:gap-4">
        <Ring value={stats.delivery_rate} color="var(--chart-2)" label="Delivered" hint="alerts that went out" />
        <Ring value={stats.read_rate} color="var(--chart-4)" label="Read on WhatsApp" hint="of delivered alerts" />
        <Ring value={stats.summarized_rate} color="var(--chart-1)" label="AI summarised" hint="of important emails" />
      </div>
      </div>
      {nothing ? (
        <p className="text-center text-xs text-muted-foreground text-pretty">
          These fill in once important email arrives and alerts go out.
        </p>
      ) : null}
    </DashCard>
  );
}
