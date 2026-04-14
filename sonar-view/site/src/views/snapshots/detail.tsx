import { useParams, useNavigate } from "react-router";
import { motion } from "motion/react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/shared/shadcn/button";
import { useSnapshot, useSnapshotMetrics } from "@/shared/hooks/use-view-api";

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  if (v < 1 && v > 0) return v.toFixed(3);
  return v.toFixed(1);
}

function getColor(index: number): string {
  const COLORS = [
    "#4ade80", "#60a5fa", "#f59e0b", "#f87171", "#a78bfa",
    "#34d399", "#38bdf8", "#fb923c", "#e879f9", "#2dd4bf",
  ];
  return COLORS[index % COLORS.length];
}

export function SnapshotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: snapshot, isLoading: loadingMeta } = useSnapshot(id ?? "");
  const { data: metricPoints = [], isLoading: loadingMetrics } = useSnapshotMetrics(id ?? "");

  // Group metric points by metric name → time series
  const metricNames = Array.from(new Set(metricPoints.map((p) => p.name)));

  // Build chart data: [{time, metricA: val, metricB: val, ...}]
  const chartDataByMetric = metricNames.map((name) => ({
    name,
    points: metricPoints
      .filter((p) => p.name === name)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((p) => ({ time: formatTime(p.timestamp), value: p.value })),
  }));

  const score = snapshot?.score;

  return (
    <div className="flex flex-col gap-6 px-4 py-4 md:px-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => void navigate("/snapshots")}>
          ← 返回列表
        </Button>
        {loadingMeta ? (
          <div className="h-7 w-48 rounded bg-muted animate-pulse" />
        ) : (
          <h1 className="text-xl font-bold">{snapshot?.name ?? "快照详情"}</h1>
        )}
      </div>

      {loadingMeta ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : snapshot ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Charts (2/3 width on lg) */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            {/* Info card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border bg-card p-4"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Tap</p>
                  <p className="font-medium">{snapshot.tapId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">状态</p>
                  <p className="font-medium capitalize">{snapshot.status}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">开始</p>
                  <p className="font-medium">{new Date(snapshot.startTime * 1000).toLocaleString("zh-CN")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">时长</p>
                  <p className="font-medium">
                    {Math.floor(snapshot.durationSec / 60)}m {snapshot.durationSec % 60}s
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Charts */}
            {loadingMetrics ? (
              <div className="h-64 rounded-xl border bg-card animate-pulse" />
            ) : chartDataByMetric.length === 0 ? (
              <div className="rounded-xl border bg-card p-12 text-center">
                <p className="text-sm text-muted-foreground">暂无指标数据</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {chartDataByMetric.map(({ name, points }, i) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="rounded-xl border bg-card p-4"
                  >
                    <p className="mb-3 text-sm font-semibold">{name}</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.06} />
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} tickFormatter={formatValue} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                          formatter={(v: unknown) => [formatValue(Number(v)), name]}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={getColor(i)}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Score breakdown (1/3 width on lg) */}
          <div className="flex flex-col gap-4">
            {score ? (
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-xl border bg-card p-4"
              >
                <p className="mb-3 text-sm font-bold">评分详情</p>
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-4xl font-bold tabular-nums">{score.total}</span>
                  <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-2xl font-bold text-primary">
                    {score.grade}
                  </span>
                </div>
                <div className="space-y-3">
                  {score.metrics.map((m) => (
                    <div key={m.metricName}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="truncate font-medium">{m.metricName}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {m.metricScore.toFixed(0)} × {m.weight}% = {m.weightedScore.toFixed(1)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${m.metricScore}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="rounded-xl border bg-card p-6 text-center">
                <p className="text-sm text-muted-foreground">未配置评分规则</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">快照不存在或加载失败</p>
        </div>
      )}
    </div>
  );
}
