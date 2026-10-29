"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addDays, eachDay } from "@/lib/dates";

export interface TrendDatum {
  date: string;
  dials: number;
  connections: number;
  applications: number;
}

const METRICS = {
  applications: "Applications",
  dials: "Outbound dials",
  connections: "Voice connections",
} as const;
type MetricKey = keyof typeof METRICS;

const RANGES = { "7": "Last 7 days", "14": "Last 14 days", all: "Whole campaign" } as const;
type RangeKey = keyof typeof RANGES;

const shortDate = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
};
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

/**
 * Daily activity as a gradient area chart with a pill filter for metric and
 * range. Days without a saved entry are gaps (unknown), never zeros; the
 * aggregate baseline is not spread across days.
 */
export function TrendCard({ data, asOf, campaignStart }: { data: TrendDatum[]; asOf: string; campaignStart: string }) {
  const [metric, setMetric] = useState<MetricKey>("applications");
  const [range, setRange] = useState<RangeKey>("14");

  const byDate = useMemo(() => new Map(data.map((d) => [d.date, d])), [data]);

  const series = useMemo(() => {
    const start = range === "all" ? campaignStart : addDays(asOf, -(Number(range) - 1));
    const from = start < campaignStart ? campaignStart : start;
    return eachDay(from, asOf).map((date) => ({ date, value: byDate.get(date)?.[metric] ?? null }));
  }, [range, campaignStart, asOf, byDate, metric]);

  // last 7 days vs the 7 before, using only logged days in each window
  const change = useMemo(() => {
    const sum = (from: string, to: string) => {
      const days = eachDay(from, to).filter((d) => byDate.has(d));
      return days.length ? days.reduce((a, d) => a + byDate.get(d)![metric], 0) : null;
    };
    const recent = sum(addDays(asOf, -6), asOf);
    const prior = sum(addDays(asOf, -13), addDays(asOf, -7));
    if (recent === null || prior === null || prior === 0) return null;
    return (recent - prior) / prior;
  }, [byDate, asOf, metric]);

  const total = series.reduce((a, d) => a + (d.value ?? 0), 0);
  const logged = series.filter((d) => d.value !== null).length;
  const compact = series.length <= 14;

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Activity trend</CardTitle>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Last 7 days vs prior 7:{" "}
              {change === null ? (
                <span className="text-muted-foreground">not enough history yet</span>
              ) : (
                <span className={change >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
                  {change >= 0 ? "+" : ""}
                  {(change * 100).toFixed(0)}%
                </span>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-navy" />
              Total {METRICS[metric].toLowerCase()}: <span className="font-semibold text-charcoal">{total.toLocaleString()}</span>
            </span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="pill" size="sm">
              {RANGES[range]} <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Show</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
              {Object.entries(METRICS).map(([k, l]) => (
                <DropdownMenuRadioItem key={k} value={k}>
                  {l}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Range</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              {Object.entries(RANGES).map(([k, l]) => (
                <DropdownMenuRadioItem key={k} value={k}>
                  {l}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="h-60 w-full">
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#101C2E" stopOpacity={0.95} />
                  <stop offset="55%" stopColor="#3b4a62" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#D8C39A" stopOpacity={0.12} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eee7d8" vertical={false} />
              <XAxis dataKey="date" tickFormatter={compact ? weekday : shortDate} tick={{ fontSize: 11, fill: "#6b6a66" }} minTickGap={compact ? 4 : 18} />
              <YAxis tick={{ fontSize: 11, fill: "#6b6a66" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid #e6dfcf", background: "#fffdf8", fontSize: 12 }}
                labelFormatter={(d) => shortDate(String(d))}
                formatter={(v) => [v === null || v === undefined ? "Not logged" : Number(v).toLocaleString(), METRICS[metric]]}
              />
              <Area type="monotone" dataKey="value" stroke="#101C2E" strokeWidth={2} fill="url(#trendFill)" connectNulls={false} dot={logged <= 3 ? { r: 4, fill: "#B08D57", stroke: "#101C2E" } : false} activeDot={{ r: 5, fill: "#B08D57", stroke: "#101C2E" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {logged < series.length && (
          <p className="mt-2 text-xs text-muted-foreground">
            Gaps are days without a saved entry. The Oct 15–28 baseline is a single aggregate and isn&apos;t split across days.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
