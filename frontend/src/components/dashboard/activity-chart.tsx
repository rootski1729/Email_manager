"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DayStat } from "@/lib/api/types";
import { formatNumber, shortDay } from "@/lib/format";

// Categorical slots in fixed order: 1 matched, 2 failed, 3 sent.
const alertsConfig = {
  matched: { label: "Matched", color: "var(--chart-1)" },
  sent: { label: "Sent", color: "var(--chart-3)" },
  failed: { label: "Failed", color: "var(--chart-2)" },
} satisfies ChartConfig;

const scannedConfig = {
  scanned: { label: "Scanned", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ActivityChart({ series }: { series: DayStat[] }) {
  const data = series.map((d) => ({ ...d, label: shortDay(d.date) }));
  const totals = series.reduce(
    (acc, d) => ({
      scanned: acc.scanned + d.scanned,
      matched: acc.matched + d.matched,
      sent: acc.sent + d.sent,
      failed: acc.failed + d.failed,
    }),
    { scanned: 0, matched: 0, sent: 0, failed: 0 },
  );

  return (
    <Card>
      <Tabs defaultValue="alerts" className="gap-0">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Last 14 days</CardTitle>
            <CardDescription>
              {formatNumber(totals.scanned)} scanned · {formatNumber(totals.matched)} matched ·{" "}
              {formatNumber(totals.sent)} sent
            </CardDescription>
          </div>
          <TabsList>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="scanned">Scanned</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent className="pt-4">
          <TabsContent value="alerts">
            <ChartContainer config={alertsConfig} className="aspect-auto h-64 w-full">
              <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  {(["matched", "sent", "failed"] as const).map((k) => (
                    <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                <ChartTooltip cursor content={<ChartTooltipContent indicator="line" />} />
                <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
                {(["matched", "sent", "failed"] as const).map((k) => (
                  <Area
                    key={k}
                    dataKey={k}
                    type="monotone"
                    stroke={`var(--color-${k})`}
                    strokeWidth={2}
                    fill={`url(#fill-${k})`}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ChartContainer>
          </TabsContent>
          <TabsContent value="scanned">
            <ChartContainer config={scannedConfig} className="aspect-auto h-64 w-full">
              <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent />} />
                <Bar dataKey="scanned" fill="var(--color-scanned)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          </TabsContent>
          <TabsContent value="table">
            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Scanned</TableHead>
                    <TableHead className="text-right">Matched</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...data].reverse().map((d) => (
                    <TableRow key={d.date}>
                      <TableCell>{d.label}</TableCell>
                      <TableCell className="text-right tabular">{formatNumber(d.scanned)}</TableCell>
                      <TableCell className="text-right tabular">{formatNumber(d.matched)}</TableCell>
                      <TableCell className="text-right tabular">{formatNumber(d.sent)}</TableCell>
                      <TableCell className="text-right tabular">{formatNumber(d.failed)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
