import { useMemo, useState, useCallback, memo } from "react";
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
import { useChartColors, getSeriesColorFromKey } from "@/shared/hooks/use-chart-colors";
import { useYAxisWidth } from "@/shared/hooks/use-y-axis-width";
import { formatValue, formatShortTime } from "@/shared/lib/chart-utils";
import { filterPointsByLabels } from "@/shared/lib/label-utils";
import type { AggregatedPoint } from "@/lib/points-compressed";

const MAX_SERIES = 30; // Hard limit for canvas rendering performance

interface MetricChartsGridProps {
  data: Map<string, AggregatedPoint[]>;
  legendVisible: boolean;
  gridCols: 1 | 2;
  selectedLabels?: Record<string, string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SingleMetricChart Component with Legend Interaction
// ─────────────────────────────────────────────────────────────────────────────

interface SingleChartProps {
  metricName: string;
  points: AggregatedPoint[];
  legendVisible: boolean;
  selectedLabels?: Record<string, string[]>;
}

function labelsToSeriesKey(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "_default";
  return entries.map(([k, v]) => `${k}=${v}`).join(",");
}

function toSafeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Custom comparison for memo optimization.
 * Prevents re-renders if data hasn't actually changed (ignoring object identity).
 */
function areChartPropsEqual(prevProps: SingleChartProps, nextProps: SingleChartProps): boolean {
  // If metric name differs, always re-render
  if (prevProps.metricName !== nextProps.metricName) return false;

  // Compare legend visibility
  if (prevProps.legendVisible !== nextProps.legendVisible) return false;

  // Compare selected labels (deep comparison)
  const prevLabelKeys = Object.keys(prevProps.selectedLabels ?? {}).sort();
  const nextLabelKeys = Object.keys(nextProps.selectedLabels ?? {}).sort();
  if (prevLabelKeys.length !== nextLabelKeys.length) return false;
  for (let i = 0; i < prevLabelKeys.length; i++) {
    const key = prevLabelKeys[i];
    if (!nextLabelKeys.includes(key)) return false;
    const prevVals = prevProps.selectedLabels?.[key] ?? [];
    const nextVals = nextProps.selectedLabels?.[key] ?? [];
    if (
      prevVals.length !== nextVals.length ||
      !prevVals.every((v) => nextVals.includes(v))
    ) {
      return false;
    }
  }

  // Compare point count (sufficient for data comparison)
  if (prevProps.points.length !== nextProps.points.length) return false;

  // Compare first and last points' timestamps
  if (prevProps.points.length > 0 && nextProps.points.length > 0) {
    const prevFirst = prevProps.points[0];
    const prevLast = prevProps.points[prevProps.points.length - 1];
    const nextFirst = nextProps.points[0];
    const nextLast = nextProps.points[nextProps.points.length - 1];

    if (
      prevFirst.timestamp !== nextFirst.timestamp ||
      prevLast.timestamp !== nextLast.timestamp
    ) {
      return false;
    }
  }

  // No differences detected
  return true;
}

const SingleMetricChartMemo = memo(
  function SingleMetricChartImpl({
    metricName,
    points,
    legendVisible,
    selectedLabels,
  }: SingleChartProps) {
    // Filter points by selected labels
    const filteredPoints = useMemo(() => {
      if (!selectedLabels || Object.keys(selectedLabels).length === 0) {
        return points;
      }
      return filterPointsByLabels(points, selectedLabels);
    }, [points, selectedLabels]);

    // Group points by label combo → series key
    const seriesMap = useMemo(() => {
      const map = new Map<string, AggregatedPoint[]>();
      for (const p of filteredPoints) {
        const key = labelsToSeriesKey(p.labels);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      }
      return map;
    }, [filteredPoints]);

    // Truncate to MAX_SERIES for performance
    const seriesKeys = useMemo(() => {
      const keys = Array.from(seriesMap.keys());
      return keys.slice(0, MAX_SERIES);
    }, [seriesMap]);

    const hiddenSeriesCount = useMemo(() => {
      return Math.max(0, seriesMap.size - MAX_SERIES);
    }, [seriesMap]);

    // Build flat chart rows
    const chartData = useMemo(() => {
      const allTs = new Set<number>();
      for (const pts of seriesMap.values()) {
        for (const p of pts) allTs.add(p.timestamp);
      }
      const sorted = Array.from(allTs).sort((a, b) => a - b);
      return sorted.map((ts) => {
        const row: Record<string, number | string> = {
          ts,
          time: formatShortTime(ts),
        };
        for (const [key, pts] of seriesMap.entries()) {
          if (seriesKeys.includes(key)) {
            const pt = pts.find((p) => p.timestamp === ts);
            if (pt !== undefined) row[key] = pt.value;
          }
        }
        return row;
      });
    }, [seriesMap, seriesKeys]);

    // Latest value of first series for header
    const firstSeries = seriesKeys[0];
    const latestPoint = firstSeries
      ? seriesMap.get(firstSeries)?.at(-1)
      : undefined;
    const firstColor = getSeriesColorFromKey(firstSeries ?? metricName);

    // Calculate max value for Y-axis width
    const maxValue = useMemo(() => {
      let max = 0;
      for (const row of chartData) {
        for (const key of seriesKeys) {
          const val = Number(row[key]);
          if (!isNaN(val) && val > max) max = val;
        }
      }
      return max;
    }, [chartData, seriesKeys]);

    const yAxisWidth = useYAxisWidth(maxValue);
    const showLegend = legendVisible && seriesKeys.length > 1;

    // Legend interaction state
    const [visibleSeries, setVisibleSeries] = useState<Set<string> | null>(null);

    const handleLegendClick = useCallback((e: any) => {
      const key = e.dataKey;
      setVisibleSeries((prev) => {
        if (prev === null) {
          // First click: hide this series
          const all = new Set(seriesKeys);
          all.delete(key);
          return all.size === 0 ? null : all;
        } else if (prev.has(key)) {
          // Toggle: show it
          const updated = new Set(prev);
          updated.add(key);
          return updated.size === seriesKeys.length ? null : updated;
        } else {
          // Toggle: hide it
          const updated = new Set(prev);
          updated.delete(key);
          return updated.size === 0 ? null : updated;
        }
      });
    }, [seriesKeys]);

    const handleLegendDoubleClick = useCallback((e: any) => {
      const key = e.dataKey;
      setVisibleSeries(new Set([key])); // Solo mode
    }, []);

    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{metricName}</p>
            {hiddenSeriesCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                ⚠️ {hiddenSeriesCount} 个数据序列未显示（仅显示前 {MAX_SERIES} 个）
              </p>
            )}
            {latestPoint && (
              <p
                className="text-2xl font-bold tabular-nums"
                style={{ color: firstColor }}
              >
                {formatValue(latestPoint.value)}
              </p>
            )}
          </div>
          {latestPoint && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatShortTime(latestPoint.timestamp)}
            </span>
          )}
        </div>

        <ResponsiveContainer
          width="100%"
          height={showLegend ? 180 : 140}
        >
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              {seriesKeys.map((key) => {
                const color = getSeriesColorFromKey(key);
                const gradId = `grad-${toSafeId(metricName)}-${toSafeId(key)}`;
                return (
                  <linearGradient
                    key={key}
                    id={gradId}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
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
              width={yAxisWidth}
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
                onClick={handleLegendClick}
                onDoubleClick={handleLegendDoubleClick}
                formatter={(value: string) =>
                  value === "_default" ? metricName : value
                }
              />
            )}
            {seriesKeys.map((key) => {
              const color = getSeriesColorFromKey(key);
              const gradId = `grad-${toSafeId(metricName)}-${toSafeId(key)}`;
              const isVisible =
                visibleSeries === null || visibleSeries.has(key);

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
                  strokeOpacity={isVisible ? 1 : 0.15}
                  fillOpacity={isVisible ? 0.3 : 0.05}
                  style={{ pointerEvents: "none" }}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  },
  areChartPropsEqual
);

// ─────────────────────────────────────────────────────────────────────────────
// MetricChartsGrid Component
// ─────────────────────────────────────────────────────────────────────────────

export function MetricChartsGrid({
  data,
  legendVisible,
  gridCols,
  selectedLabels,
}: MetricChartsGridProps) {
  const entries = Array.from(data.entries());

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <span className="text-2xl">📊</span>
        </div>
        <p className="text-sm text-muted-foreground">
          暂无指标数据，等待数据拉取...
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-4",
        gridCols === 2 ? "sm:grid-cols-2" : "grid-cols-1"
      )}
    >
      {entries.map(([name, points]) => (
        <SingleMetricChartMemo
          key={name}
          metricName={name}
          points={points}
          legendVisible={legendVisible}
          selectedLabels={selectedLabels}
        />
      ))}
    </div>
  );
}
