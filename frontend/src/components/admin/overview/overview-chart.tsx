"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DayCount } from "@/lib/admin/types";
import { formatNumber, shortDay } from "@/lib/format";

// Fixed categorical order: slot 1 matched, slot 2 sent, slot 3 new clients.
const mailConfig = {
  matched: { label: "Important emails", color: "var(--chart-1)" },
  sent: { label: "WhatsApp sent", color: "var(--chart-2)" },
} satisfies ChartConfig;

const clientsConfig = {
  new_clients: { label: "New clients", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function OverviewChart({ series }: { series: DayCount[] }) {
  const data = series.map((d) => ({ ...d, label: shortDay(d.date) }));
  const totals = series.reduce(
    (a, d) => ({ matched: a.matched + d.matched, sent: a.sent + d.sent, new_clients: a.new_clients + d.new_clients }),
    { matched: 0, sent: 0, new_clients: 0 },
  );

  return (
    <Card>
      <Tabs defaultValue="mail" className="gap-0">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Last 14 days</CardTitle>
            <CardDescription>
              {formatNumber(totals.matched)} important emails · {formatNumber(totals.sent)} WhatsApp messages ·{" "}
              {formatNumber(totals.new_clients)} new clients
            </CardDescription>
          </div>
          <TabsList>
            <TabsTrigger value="mail">Emails & alerts</TabsTrigger>
            <TabsTrigger value="clients">New clients</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent className="pt-4">
          <TabsContent value="mail">
            <ChartContainer config={mailConfig} className="aspect-auto h-64 w-full">
              <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  {(["matched", "sent"] as const).map((k) => (
                    <linearGradient key={k} id={`admin-fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                <ChartTooltip cursor content={<ChartTooltipContent indicator="line" />} />
                <ChartLegend content={<ChartLegendContent />} />
                {(["matched", "sent"] as const).map((k) => (
                  <Area
                    key={k}
                    dataKey={k}
                    type="monotone"
                    stroke={`var(--color-${k})`}
                    strokeWidth={2}
                    fill={`url(#admin-fill-${k})`}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ChartContainer>
          </TabsContent>
          <TabsContent value="clients">
            <ChartContainer config={clientsConfig} className="aspect-auto h-64 w-full">
              <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent />} />
                <Bar
                  dataKey="new_clients"
                  fill="var(--color-new_clients)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
          </TabsContent>
          <TabsContent value="table">
            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Important emails</TableHead>
                    <TableHead className="text-right">WhatsApp sent</TableHead>
                    <TableHead className="text-right">New clients</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...data].reverse().map((d) => (
                    <TableRow key={d.date}>
                      <TableCell>{d.label}</TableCell>
                      <TableCell className="text-right tabular">{formatNumber(d.matched)}</TableCell>
                      <TableCell className="text-right tabular">{formatNumber(d.sent)}</TableCell>
                      <TableCell className="text-right tabular">{formatNumber(d.new_clients)}</TableCell>
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
