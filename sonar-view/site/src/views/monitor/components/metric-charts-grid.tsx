import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { cn } from "@/shared/lib/utils";
import type { AggregatedPoint } from "@/lib/points-compressed";

interface MetricChartsGridProps {
  data: Map<string, AggregatedPoint[]>;
  legendVisible: boolean;
  gridCols: 1 | 2;
}

// Deterministic HSL color based on a string key
function getSeriesColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 60%)`;
}

function formatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value < 1 && value > 0) return value.toFixed(3);
  return value.toFixed(1);
}

function formatTime(tsMs: number): string {
  const d = new Date(tsMs);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

/** Convert labels record → stable string key for series identification */
function labelsToSeriesKey(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "_default";
  return entries.map(([k, v]) => `${k}=${v}`).join(",");
}

/** Make a safe CSS id fragment from an arbitrary string */
function toSafeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}

interface SingleChartProps {
  metricName: string;
  points: AggregatedPoint[]; // pre-sorted by timestamp, aggregation_type === 'avg'
  legendVisible: boolean;
}

function SingleMetricChart({ metricName, points, legendVisible }: SingleChartProps) {
  // Group points by label-combo → series key
  const seriesMap = useMemo(() => {
    const map = new Map<string, AggregatedPoint[]>();
    for (const p of points) {
      const key = labelsToSeriesKey(p.labels);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [points]);

  const seriesKeys = useMemo(() => Array.from(seriesMap.keys()), [seriesMap]);

  // Build flat chart rows: one row per unique timestamp, columns = series keys
  const chartData = useMemo(() => {
    const allTs = new Set<number>();
    for (const pts of seriesMap.values()) {
      for (const p of pts) allTs.add(p.timestamp);
    }
    const sorted = Array.from(allTs).sort((a, b) => a - b);
    return sorted.map((ts) => {
      const row: Record<string, number | string> = {
        ts,
        time: formatTime(ts),
      };
      for (const [key, pts] of seriesMap.entries()) {
        const pt = pts.find((p) => p.timestamp === ts);
        if (pt !== undefined) row[key] = pt.value;
      }
      return row;
    });
  }, [seriesMap]);

  // Latest value of the first series for the header
  const firstSeries = seriesKeys[0];
  const latestPoint = firstSeries ? seriesMap.get(firstSeries)?.at(-1) : undefined;
  const firstColor = getSeriesColor(firstSeries ?? metricName);

  const showLegend = legendVisible && seriesKeys.length > 1;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{metricName}</p>
          {latestPoint && (
            <p className="text-2xl font-bold tabular-nums" style={{ color: firstColor }}>
              {formatValue(latestPoint.value)}
            </p>
          )}
        </div>
        {latestPoint && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatTime(latestPoint.timestamp)}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={showLegend ? 160 : 120}>
        <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            {seriesKeys.map((key) => {
              const color = getSeriesColor(key);
              const gradId = `grad-${toSafeId(metricName)}-${toSafeId(key)}`;
              return (
                <linearGradient key={key} id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            strokeOpacity={0.06}
          />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={formatValue}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
            }}
            formatter={(val: unknown, name: string) => [
              formatValue(Number(val)),
              name === "_default" ? metricName : name,
            ]}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              formatter={(value: string) => (value === "_default" ? metricName : value)}
            />
          )}
          {seriesKeys.map((key) => {
            const color = getSeriesColor(key);
            const gradId = `grad-${toSafeId(metricName)}-${toSafeId(key)}`;
            return (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={key === "_default" ? metricName : key}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradId})`}
                isAnimationActive={false}
                dot={false}
                connectNulls
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricChartsGrid({ data, legendVisible, gridCols }: MetricChartsGridProps) {
  const entries = Array.from(data.entries());

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <span className="text-2xl">📊</span>
        </div>
        <p className="text-sm text-muted-foreground">暂无指标数据，等待数据拉取...</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-4",
        gridCols === 2 ? "sm:grid-cols-2" : "grid-cols-1",
      )}
    >
      {entries.map(([name, points]) => (
        <SingleMetricChart
          key={name}
          metricName={name}
          points={points}
          legendVisible={legendVisible}
        />
      ))}
    </div>
  );
}
