import { useMemo } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Columns2, RefreshCw } from "lucide-react";
import { useStoreConfigs, useActivateStoreConfig } from "@/shared/hooks/use-view-api";
import { useMonitorStore } from "@/stores/use-monitor-store";
import { MonitorSidebar } from "./components/monitor-sidebar";
import { GranularitySelector } from "./components/granularity-selector";
import { MetricChartsGrid } from "./components/metric-charts-grid";
import { Button } from "@/shared/shadcn/button";
import { queryPoints } from "@/lib/points-api";
import {
  createCompressedDataIndex,
  getPointsFromIndex,
} from "@/lib/points-compressed";
import type { AggregatedPoint } from "@/lib/points-compressed";
import { GRANULARITY_CONFIG } from "@/lib/granularity-config";

export function MonitorPage() {
  const { data: storeConfigs = [], isLoading } = useStoreConfigs();
  const { mutate: activateStore, isPending: isActivating } = useActivateStoreConfig();

  // Use active store or first store as data source
  const activeStore = storeConfigs.find((s) => s.is_active) ?? storeConfigs[0];

  const { granularity, setGranularity, legendVisible, gridCols, toggleGridCols } =
    useMonitorStore();

  // Look up granularity config
  const levelCfg = GRANULARITY_CONFIG[granularity];

  // ── HTTP polling query ────────────────────────────────────────────────────
  const {
    data: compressedIndex,
    dataUpdatedAt,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["points", activeStore?.id, granularity] as const,
    queryFn: async () => {
      const endTime = Date.now() - 40_000; // 40s query delay compensation
      const startTime = endTime - levelCfg.queryWindowMs;
      const resp = await queryPoints({
        datasource_id: activeStore!.id,
        levels: [granularity],
        start_time: startTime,
        end_time: endTime,
      });
      return createCompressedDataIndex(resp.p, activeStore!.id, granularity);
    },
    refetchInterval: levelCfg.refreshIntervalMs,
    enabled: Boolean(activeStore?.id),
    // Keep previous data during refetch to avoid chart flicker
    placeholderData: (prev) => prev,
  });

  // ── Convert compressed index → Map<metricName, AggregatedPoint[]> ────────
  const chartData = useMemo<Map<string, AggregatedPoint[]>>(() => {
    if (!compressedIndex) return new Map();

    const result = new Map<string, AggregatedPoint[]>();
    for (const metricName of compressedIndex.metricToIndices.keys()) {
      const allPoints = getPointsFromIndex(compressedIndex, metricName);
      const avgPoints = allPoints
        .filter((p) => p.aggregation_type === "avg")
        .sort((a, b) => a.timestamp - b.timestamp);

      if (avgPoints.length > 0) {
        result.set(metricName, avgPoints);
      }
    }
    return result;
  }, [compressedIndex]);

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar: store list */}
      <MonitorSidebar
        stores={storeConfigs}
        isLoading={isLoading}
        activeStoreId={activeStore?.id ?? null}
        onActivate={(id) => activateStore(id)}
        isActivating={isActivating}
      />

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {!activeStore ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
              <span className="text-3xl">🖥</span>
            </div>
            <p className="font-semibold">暂无数据存储配置</p>
            <p className="text-sm text-muted-foreground">
              请先在设置页面添加 Store 配置
            </p>
          </div>
        ) : (
          <motion.div
            key={activeStore.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-4 px-4 py-4 lg:px-6"
          >
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <GranularitySelector
                value={granularity}
                onChange={setGranularity}
              />

              {/* Active store label */}
              <span className="text-sm text-muted-foreground">
                当前数据源:{" "}
                <span className="font-medium text-foreground">
                  {activeStore.name}
                </span>
                {activeStore.is_active && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    Active
                  </span>
                )}
              </span>

              {/* Right-side controls */}
              <div className="ml-auto flex items-center gap-2">
                {/* Last update / error status */}
                {dataUpdatedAt > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {isError ? (
                      <span className="text-destructive">获取失败</span>
                    ) : (
                      <>上次更新: {new Date(dataUpdatedAt).toLocaleTimeString()}</>
                    )}
                  </span>
                )}

                {/* Manual refresh */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  title="手动刷新"
                >
                  <RefreshCw
                    className={isFetching ? "animate-spin" : ""}
                    size={14}
                  />
                </Button>

                {/* Grid cols toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={toggleGridCols}
                  title={gridCols === 2 ? "切换为单列" : "切换为双列"}
                >
                  {gridCols === 2 ? <Columns2 size={14} /> : <LayoutGrid size={14} />}
                </Button>
              </div>
            </div>

            {/* Charts grid */}
            <MetricChartsGrid
              data={chartData}
              legendVisible={legendVisible}
              gridCols={gridCols}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
