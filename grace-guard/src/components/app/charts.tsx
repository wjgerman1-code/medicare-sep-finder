"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const NAVY = "#101C2E";
const GOLD = "#B08D57";
const GREY = "#8A94A6";
const GREEN = "#2F6B4F";
const AXIS = { fontSize: 11, fill: "#6b6a66" };

const shortDate = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
};

const tooltipStyle = {
  contentStyle: { borderRadius: 10, border: "1px solid #e6dfcf", background: "#fffdf8", fontSize: 12 },
  labelStyle: { color: NAVY, fontWeight: 600 },
};

export interface TrajectoryDatum {
  date: string;
  required: number | null;
  actual: number | null;
  forecast: number | null;
  isBaselinePoint: boolean;
}

export function TrajectoryChart({ data, goal, asOf }: { data: TrajectoryDatum[]; goal: number | null; asOf: string }) {
  const baseline = data.find((d) => d.isBaselinePoint && d.actual !== null);
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#eee7d8" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} minTickGap={24} />
          {/* headroom above the goal so the trajectory's final segment stays visible */}
          <YAxis tick={AXIS} allowDecimals={false} domain={[0, (max: number) => Math.ceil(Math.max(max, goal ?? 0) * 1.08)]} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(d) => shortDate(String(d))}
            formatter={(v, name) => [v === null || v === undefined ? "—" : Number(v).toLocaleString(), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {goal !== null && <ReferenceLine y={goal} stroke={GOLD} strokeDasharray="2 4" />}
          <ReferenceLine x={asOf} stroke="#c9c2b2" strokeDasharray="3 3" label={{ value: "Today", position: "insideTopRight", fontSize: 10, fill: "#6b6a66" }} />
          <Line type="linear" dataKey="required" name="Goal trajectory" stroke={GOLD} strokeWidth={2} dot={false} connectNulls />
          <Area type="stepAfter" dataKey="actual" name="Actual (cumulative)" stroke={NAVY} fill={NAVY} fillOpacity={0.08} strokeWidth={2.5} connectNulls={false} />
          <Line type="linear" dataKey="forecast" name="Forecast (base case)" stroke={GREY} strokeDasharray="6 4" strokeWidth={2} dot={false} connectNulls />
          {baseline && <ReferenceDot x={baseline.date} y={baseline.actual ?? 0} r={5} fill={GOLD} stroke={NAVY} label={{ value: "Baseline", position: "top", fontSize: 10, fill: NAVY }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface DailyTrendDatum {
  date: string;
  dials: number;
  connections: number;
  applications: number;
}

export function DailyTrendChart({ data }: { data: DailyTrendDatum[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 0, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#eee7d8" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} minTickGap={16} />
          <YAxis yAxisId="left" tick={AXIS} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={AXIS} allowDecimals={false} />
          <Tooltip {...tooltipStyle} labelFormatter={(d) => shortDate(String(d))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="dials" name="Dials" fill="#d8c39a" radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Line yAxisId="right" dataKey="connections" name="Connections" stroke={NAVY} strokeWidth={2} dot={{ r: 2 }} />
          <Line yAxisId="right" dataKey="applications" name="Applications" stroke={GREEN} strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalBars({ data, valueLabel, money = false }: { data: Array<{ name: string; value: number }>; valueLabel: string; money?: boolean }) {
  const fmt = (v: number) => (money ? `$${(v / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : v.toLocaleString());
  return (
    <div className="w-full" style={{ height: Math.max(160, data.length * 40 + 30) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#eee7d8" horizontal={false} />
          <XAxis type="number" tick={AXIS} tickFormatter={fmt} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={AXIS} width={120} />
          <Tooltip {...tooltipStyle} formatter={(v) => [fmt(Number(v)), valueLabel]} />
          <Bar dataKey="value" name={valueLabel} fill={NAVY} radius={[0, 4, 4, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueStagesChart({ data }: { data: Array<{ stage: string; cents: number; kind: "estimate" | "actual" }> }) {
  const rows = data.map((d) => ({ ...d, estimate: d.kind === "estimate" ? d.cents / 100 : 0, actual: d.kind === "actual" ? d.cents / 100 : 0 }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#eee7d8" vertical={false} />
          <XAxis dataKey="stage" tick={AXIS} interval={0} />
          <YAxis tick={AXIS} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
          <Tooltip {...tooltipStyle} formatter={(v, n) => [`$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="estimate" name="Expected (estimate)" stackId="a" fill="#d8c39a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="actual" name="Actual cash" stackId="a" fill={NAVY} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
