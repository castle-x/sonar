import { useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { useTaps } from "@/shared/hooks/use-view-api";
import { useMonitorStream } from "@/shared/hooks/use-monitor-stream";
import { useMonitorStore } from "@/stores/use-monitor-store";
import { MonitorSidebar } from "./components/monitor-sidebar";
import { GranularitySelector } from "./components/granularity-selector";
import { MetricChartsGrid } from "./components/metric-charts-grid";
import { WSStatusBadge } from "./components/ws-status-badge";
import type { GranularityName } from "@/shared/types";

export function MonitorPage() {
  const { tapId: paramTapId } = useParams<{ tapId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("dashboard");

  const { data: taps = [], isLoading } = useTaps();
  const { selectedTapId, setSelectedTapId, granularity, setGranularity } = useMonitorStore();

  // Sync URL param → store
  useEffect(() => {
    if (paramTapId && paramTapId !== selectedTapId) {
      setSelectedTapId(paramTapId);
    } else if (!paramTapId && taps.length > 0 && !selectedTapId) {
      // Auto-select first tap
      const firstId = taps[0].id;
      setSelectedTapId(firstId);
      void navigate(`/monitor/${firstId}`, { replace: true });
    }
  }, [paramTapId, taps, selectedTapId, setSelectedTapId, navigate]);

  // Sync store → URL
  const handleSelectTap = (id: string) => {
    setSelectedTapId(id);
    void navigate(`/monitor/${id}`);
  };

  const activeTapId = paramTapId || selectedTapId;
  const { data: streamData, status: wsStatus } = useMonitorStream({
    tapId: activeTapId ?? null,
    granularity,
    enabled: Boolean(activeTapId),
  });

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
            <p className="font-semibold">{t("pages.monitor.noTap" as never)}</p>
            <p className="text-sm text-muted-foreground">{t("pages.monitor.noTapDesc" as never)}</p>
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
            <div className="flex items-center gap-3">
              <GranularitySelector
                value={granularity}
                onChange={(g) => setGranularity(g as GranularityName)}
              />
              <div className="ml-auto">
                <WSStatusBadge status={wsStatus} />
              </div>
            </div>

            {/* Charts grid */}
            <MetricChartsGrid
              data={streamData}
              tapId={activeTapId}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}
