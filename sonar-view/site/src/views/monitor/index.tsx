import { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useTaps } from "@/shared/hooks/use-view-api";
import { useMonitorStore } from "@/stores/use-monitor-store";
import { MonitorSidebar } from "./components/monitor-sidebar";
import { GranularitySelector } from "./components/granularity-selector";
import { MetricChartsGrid } from "./components/metric-charts-grid";
import { queryPoints } from "@/lib/points-api";
import {
  createCompressedDataIndex,
  getPointsFromIndex,
} from "@/lib/points-compressed";
import {
  findAggregationLevel,
  calculateQueryTimeWindow,
} from "@/lib/aggregation-config";
import type { GranularityName, MetricPoint } from "@/shared/types";

export function MonitorPage() {
  const { tapId: paramTapId } = useParams<{ tapId: string }>();
  const navigate = useNavigate();

  const { data: taps = [], isLoading } = useTaps();
  const { selectedTapId, setSelectedTapId, granularity, setGranularity } =
    useMonitorStore();

  // Sync URL param → store
  useEffect(() => {
    if (paramTapId && paramTapId !== selectedTapId) {
      setSelectedTapId(paramTapId);
    } else if (!paramTapId && taps.length > 0 && !selectedTapId) {
      const firstId = taps[0].id;
      setSelectedTapId(firstId);
      void navigate(`/monitor/${firstId}`, { replace: true });
    }
  }, [paramTapId, taps, selectedTapId, setSelectedTapId, navigate]);

  const handleSelectTap = (id: string) => {
    setSelectedTapId(id);
    void navigate(`/monitor/${id}`);
  };

  const activeTapId = paramTapId ?? selectedTapId;

  // Map GranularityName → AggregationLevel for interval/retention config
  const selectedLevel = findAggregationLevel(granularity);

  // ── HTTP polling query (replaces WS points subscription) ─────────────────
  const { data: compressedIndex, dataUpdatedAt, isError } = useQuery({
    queryKey: ["points", activeTapId, selectedLevel.name] as const,
    queryFn: async () => {
      const { startTime, endTime } = calculateQueryTimeWindow(selectedLevel);
      const resp = await queryPoints({
        datasource_id: activeTapId!,
        levels: [selectedLevel.name],
        start_time: startTime,
        end_time: endTime,
      });
      return createCompressedDataIndex(resp.p, activeTapId!, selectedLevel.name);
    },
    refetchInterval: selectedLevel.refreshInterval,
    enabled: Boolean(activeTapId),
    // Keep previous data during refetch to avoid chart flicker
    placeholderData: (prev) => prev,
  });

  // ── Convert compressed index → Map<metricName, MetricPoint[]> ─────────────
  // Only use 'avg' aggregation type for chart display
  const chartData = useMemo<Map<string, MetricPoint[]>>(() => {
    if (!compressedIndex) return new Map();

    const result = new Map<string, MetricPoint[]>();
    for (const metricName of compressedIndex.metricToIndices.keys()) {
      const allPoints = getPointsFromIndex(compressedIndex, metricName);
      const avgPoints: MetricPoint[] = allPoints
        .filter((p) => p.aggregation_type === "avg")
        .map((p) => ({
          name: p.name,
          value: p.value,
          timestamp: p.timestamp / 1000, // ms → seconds (MetricPoint uses seconds)
          labels: p.labels,
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      if (avgPoints.length > 0) {
        result.set(metricName, avgPoints);
      }
    }
    return result;
  }, [compressedIndex]);

  // Find active tap name for display
  const activeTap = taps.find((t) => t.id === activeTapId);

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar: tap list */}
      <MonitorSidebar
        taps={taps}
        isLoading={isLoading}
        selectedTapId={activeTapId ?? null}
        onSelectTap={handleSelectTap}
      />

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {!activeTapId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
              <span className="text-3xl">🖥</span>
            </div>
            <p className="font-semibold">请选择一个 Tap 实例</p>
            <p className="text-sm text-muted-foreground">
              从左侧列表中选择一个数据源开始监控
            </p>
          </div>
        ) : (
          <motion.div
            key={activeTapId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-4 px-4 py-4 lg:px-6"
          >
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <GranularitySelector
                value={granularity}
                onChange={(g) => setGranularity(g as GranularityName)}
              />

              {/* Datasource label */}
              {activeTap && (
                <span className="text-sm text-muted-foreground">
                  当前数据源:{" "}
                  <span className="font-medium text-foreground">
                    {activeTap.name ?? activeTap.appId ?? activeTapId}
                  </span>
                </span>
              )}

              {/* Last update timestamp */}
              {dataUpdatedAt > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {isError ? (
                    <span className="text-destructive">获取失败</span>
                  ) : (
                    <>上次更新: {new Date(dataUpdatedAt).toLocaleTimeString()}</>
                  )}
                </span>
              )}
            </div>

            {/* Charts grid */}
            <MetricChartsGrid data={chartData} tapId={activeTapId} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
