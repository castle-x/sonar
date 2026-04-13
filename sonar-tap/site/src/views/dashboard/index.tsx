import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  DashboardBrowsingIcon,
  Activity01Icon,
  CheckmarkCircle01Icon,
  ArrowReloadHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useHealth, useMetricsPreview, useProcesses, useStatus } from "@/shared/hooks/use-tap-api";
import { StatCard } from "./stat-card";
import { Button } from "@/shared/shadcn/button";
import { Input } from "@/shared/shadcn/input";
import { Badge } from "@/shared/shadcn/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/shadcn/table";

function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: health, isLoading: healthLoading } = useHealth();
  const { data: processes, isLoading: processesLoading } = useProcesses();
  const { data: status, isLoading: statusLoading } = useStatus();
  const { data: metrics, isLoading: metricsLoading, refetch } = useMetricsPreview(200);

  const healthStatus = health?.status === "ok" ? "ok" : health ? "error" : undefined;
  const healthValue = health?.status ?? "--";

  const filteredMetrics = (metrics ?? []).filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["metrics-preview"] });
    refetch();
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          title={t("pages.dashboard.cards.health")}
          value={healthValue}
          description={t("pages.dashboard.cards.healthDesc")}
          icon={CheckmarkCircle01Icon}
          isLoading={healthLoading}
          status={healthStatus}
        />
        <StatCard
          title={t("pages.dashboard.cards.processes")}
          value={processesLoading ? "--" : (processes?.length ?? 0)}
          description={t("pages.dashboard.cards.processesDesc")}
          icon={Activity01Icon}
          isLoading={processesLoading}
        />
        <StatCard
          title={t("pages.dashboard.cards.watchers")}
          value={statusLoading ? "--" : (status?.watcher_count ?? 0)}
          description={t("pages.dashboard.cards.watchersDesc")}
          icon={DashboardBrowsingIcon}
          isLoading={statusLoading}
        />
      </div>

      {/* Metrics table */}
      <div className="rounded-lg border bg-card">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
          <Input
            placeholder={t("pages.dashboard.metrics.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <span className="flex-1 text-center text-sm text-muted-foreground">
            {metricsLoading
              ? "..."
              : t("pages.dashboard.metrics.showing", {
                  count: filteredMetrics.length,
                  total: metrics?.length ?? 0,
                })}
          </span>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={metricsLoading}>
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} className="mr-1" />
            {t("pages.dashboard.metrics.refresh")}
          </Button>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("pages.dashboard.metrics.colName")}</TableHead>
              <TableHead className="text-right">{t("pages.dashboard.metrics.colValue")}</TableHead>
              <TableHead>{t("pages.dashboard.metrics.colTime")}</TableHead>
              <TableHead>{t("pages.dashboard.metrics.colLabels")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metricsLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  {t("pages.dashboard.metrics.loading")}
                </TableCell>
              </TableRow>
            ) : filteredMetrics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  {t("pages.dashboard.metrics.empty")}
                </TableCell>
              </TableRow>
            ) : (
              filteredMetrics.map((m, idx) => (
                <TableRow key={`${m.name}-${m.timestamp}-${idx}`}>
                  <TableCell className="font-mono text-xs">{m.name}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {m.value}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(m.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {m.labels &&
                        Object.entries(m.labels).map(([k, v]) => (
                          <Badge key={k} variant="secondary" className="text-xs font-normal">
                            {k}={v}
                          </Badge>
                        ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export { DashboardPage };
