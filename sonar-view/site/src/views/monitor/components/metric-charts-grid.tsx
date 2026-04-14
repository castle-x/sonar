import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useMonitorStore } from "@/stores/use-monitor-store";
import { cn } from "@/shared/lib/utils";
import type { MetricPoint } from "@/shared/types";

interface MetricChartsGridProps {
  data: Map<string, MetricPoint[]>;
  tapId: string;
}

// Deterministic color based on metric name
function getMetricColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
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

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

interface SingleChartProps {
  metricName: string;
  points: MetricPoint[];
}

function SingleMetricChart({ metricName, points }: SingleChartProps) {
  const color = getMetricColor(metricName);
  const chartData = useMemo(
    () => points.map((p) => ({ ts: p.timestamp, value: p.value, time: formatTime(p.timestamp) })),
    [points],
  );
  const latest = points[points.length - 1];

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="truncate text-sm font-semibold">{metricName}</p>
          {latest && (
            <p className="text-2xl font-bold tabular-nums" style={{ color }}>
              {formatValue(latest.value)}
            </p>
          )}
        </div>
        {latest && (
          <span className="shrink-0 text-xs text-muted-foreground">{formatTime(latest.timestamp)}</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${metricName}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06} />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={formatValue} />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
            }}
            formatter={(val: unknown) => [formatValue(Number(val)), metricName]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${metricName})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MetricChartsGrid({ data, tapId: _ }: MetricChartsGridProps) {
  const { gridCols } = useMonitorStore();
  const entries = Array.from(data.entries());

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-12 text-center">
        <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
          <span className="text-2xl">📊</span>
        </div>
        <p className="text-sm text-muted-foreground">暂无指标数据，等待 WebSocket 推送...</p>
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
        <SingleMetricChart key={name} metricName={name} points={points} />
      ))}
    </div>
  );
}
