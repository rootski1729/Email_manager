"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChartLine, ChartNoAxesColumn, MailCheck } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { rulesQuery } from "@/lib/api/queries";
import type { ActivityDay, DashboardStats } from "@/lib/api/types";
import { formatDayKey } from "@/lib/datetime";
import { ChartEmpty, DashCard } from "./dash-card";

/*
 * Shared chart grammar: theme colours through CSS variables, muted axis text, horizontal hairlines only,
 * a dashed cursor, and a small tooltip card. The chart container maps the grid's default stroke to the
 * border token, so it reads in light and dark.
 */

const tick = (date: string, days: number) =>
  days <= 7 ? formatDayKey(date, { weekday: "short" }) : formatDayKey(date, { day: "numeric", month: "short" });
const fullDay = (date: string) => formatDayKey(date, { weekday: "short", day: "numeric", month: "short" });
/** A dashed vertical marker at the hovered day (recharts hands a custom cursor the top and bottom points). */
function DashedCursor({ points }: { points?: { x: number; y: number }[] }) {
  if (!points || points.length < 2) return null;
  const [top, bottom] = points;
  return (
    <line
      x1={top.x}
      x2={bottom.x}
      y1={top.y}
      y2={bottom.y}
      className="stroke-muted-foreground/45"
      strokeWidth={1.25}
      strokeDasharray="4 4"
      pointerEvents="none"
    />
  );
}
const cursor = <DashedCursor />;

interface TipItem {
  dataKey?: unknown;
  value?: unknown;
  name?: unknown;
  color?: string;
  payload?: { fill?: string };
}

/**
 * The tooltip card: the day (or topic) in small muted text, then each series as "● 8 Important emails".
 * Values and labels wear text colours; only the dot carries the series colour.
 */
function TipCard({
  active,
  payload,
  label,
  config,
  title,
}: {
  active?: boolean;
  payload?: readonly TipItem[];
  label?: unknown;
  config: ChartConfig;
  title?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-border">
      <p className="mb-1 text-muted-foreground">{title ? title(String(label)) : String(label)}</p>
      <ul className="space-y-1">
        {payload.map((item) => {
          const key = String(item.dataKey);
          const color = item.payload?.fill ?? item.color ?? config[key]?.color;
          return (
            <li key={key} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
              <span className="font-semibold tabular">{Number(item.value).toLocaleString()}</span>
              <span className="text-muted-foreground">{config[key]?.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
const activeDot = { r: 5, strokeWidth: 2, stroke: "var(--card)" };

function DayAxes({ days }: { days: number }) {
  return (
    <>
      <CartesianGrid vertical={false} />
      <XAxis
        dataKey="date"
        tickLine={false}
        axisLine={false}
        tickMargin={10}
        minTickGap={days <= 7 ? 4 : 18}
        tickFormatter={(d: string) => tick(d, days)}
      />
      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tickMargin={4} />
    </>
  );
}

const hasAny = (rows: ActivityDay[], keys: (keyof ActivityDay)[]) => rows.some((r) => keys.some((k) => Number(r[k]) > 0));

const importantConfig = { important: { label: "Important emails", color: "var(--chart-1)" } } satisfies ChartConfig;

/** "Important emails": one smooth line over the period with a soft gradient under it. */
export function ImportantChart({ stats, className }: { stats: DashboardStats; className?: string }) {
  const gradient = `fill-important-${useId().replace(/:/g, "")}`;
  const days = stats.period_days;
  const empty = !hasAny(stats.activity, ["important"]);
  return (
    <DashCard
      id="important-chart"
      title="Important emails"
      description={`Each day, the last ${days} days.`}
      className={className}
      action={
        <Button asChild variant="outline" size="sm" className="group/more">
          <Link href="/messages">
            See all mail
            <ArrowRight className="transition-transform duration-200 group-hover/more:translate-x-0.5" aria-hidden />
          </Link>
        </Button>
      }
    >
      {empty ? (
        <ChartEmpty
          icon={MailCheck}
          title="Nothing important yet"
          text="When an email matches what you watch for, it's counted here — and sent to your WhatsApp."
        />
      ) : (
        <ChartContainer config={importantConfig} className="aspect-auto h-56 w-full sm:h-60">
          <AreaChart data={stats.activity} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-important)" stopOpacity={0.34} />
                <stop offset="100%" stopColor="var(--color-important)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {DayAxes({ days })}
            <ChartTooltip
              cursor={cursor}
              content={(p) => <TipCard {...p} config={importantConfig} title={fullDay} />}
            />
            <Area
              dataKey="important"
              type="monotone"
              stroke="var(--color-important)"
              strokeWidth={2.5}
              fill={`url(#${gradient})`}
              activeDot={activeDot}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </DashCard>
  );
}

const activityConfig = {
  important: { label: "Important emails", color: "var(--chart-1)" },
  alerts: { label: "WhatsApp alerts", color: "var(--wa)" },
  emails_sent: { label: "Emails sent", color: "var(--chart-5)" },
} satisfies ChartConfig;

/** "Activity": important emails, WhatsApp alerts and emails sent, day by day. */
export function ActivityChart({ stats, className }: { stats: DashboardStats; className?: string }) {
  const days = stats.period_days;
  const empty = !hasAny(stats.activity, ["important", "alerts", "emails_sent"]);
  return (
    <DashCard id="activity" title="Activity" description="What came in and what went out, day by day." className={className}>
      {empty ? (
        <ChartEmpty
          icon={ChartLine}
          tint="bg-tint-sky text-tint-sky-ink"
          title="No activity yet"
          text="Important emails, WhatsApp alerts and emails you send will show up here as lines."
        />
      ) : (
        <div className="space-y-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {Object.entries(activityConfig).map(([key, c]) => (
            <li key={key} className="flex items-center gap-1.5">
              <span className="h-[3px] w-3.5 rounded-full" style={{ background: c.color }} aria-hidden />
              {c.label}
            </li>
          ))}
        </ul>
        <ChartContainer config={activityConfig} className="aspect-auto h-60 w-full">
          <LineChart data={stats.activity} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            {DayAxes({ days })}
            <ChartTooltip cursor={cursor} content={(p) => <TipCard {...p} config={activityConfig} title={fullDay} />} />
            {(Object.keys(activityConfig) as (keyof typeof activityConfig)[]).map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ ...activeDot, r: 4 }}
              />
            ))}
          </LineChart>
        </ChartContainer>
        </div>
      )}
    </DashCard>
  );
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const topicConfig = { count: { label: "Emails" } } satisfies ChartConfig;

/** "By topic": important emails per rule. Each topic keeps its colour (by its place in your list), whatever the period. */
export function TopicChart({ stats, className }: { stats: DashboardStats; className?: string }) {
  const rules = useQuery(rulesQuery);
  const order = new Map((rules.data ?? []).map((r, i) => [r.name, i]));
  const data = stats.by_rule.map((r) => ({
    name: r.name,
    count: r.count,
    fill: `var(--chart-${((order.get(r.name) ?? hash(r.name)) % 5) + 1})`,
  }));
  const longest = Math.max(0, ...data.map((d) => Math.min(d.name.length, 18)));
  return (
    <DashCard
      id="topics"
      title="By topic"
      description="Important emails per thing you watch."
      className={className}
      action={
        <Button asChild variant="ghost" size="sm" className="text-brand-ink">
          <Link href="/rules">Edit</Link>
        </Button>
      }
    >
      {data.length === 0 ? (
        <ChartEmpty
          icon={ChartNoAxesColumn}
          tint="bg-tint-amber text-tint-amber-ink"
          title="No topics yet"
          text="Once emails match what you watch for — exams, jobs, bank… — each topic gets a bar here."
        />
      ) : (
        <div className="flex flex-1 items-center">
          <ChartContainer config={topicConfig} className="aspect-auto w-full" style={{ height: data.length * 40 + 8 }}>
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }} barCategoryGap={10}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={Math.max(56, longest * 8 + 12)}
                tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
              />
              <ChartTooltip cursor={false} content={(p) => <TipCard {...p} config={topicConfig} />} />
              <Bar dataKey="count" radius={6} maxBarSize={22} background={{ radius: 6, className: "fill-muted" }}>
                <LabelList
                  dataKey="count"
                  position="right"
                  offset={8}
                  className="fill-foreground font-medium tabular"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </DashCard>
  );
}
