import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/shared/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/shadcn/dialog";
import { useSnapshots, useDeleteSnapshot, useTaps } from "@/shared/hooks/use-view-api";
import type { SnapshotMeta } from "@/shared/types";
import { CreateSnapshotForm } from "./components/create-snapshot-form";

function SnapshotStatusBadge({ status }: { status: SnapshotMeta["status"] }) {
  const colors: Record<SnapshotMeta["status"], string> = {
    creating: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    ready: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    failed: "bg-destructive/15 text-destructive",
  };
  const labels: Record<SnapshotMeta["status"], string> = {
    creating: "创建中",
    ready: "就绪",
    failed: "失败",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

function ScoreBadge({ score }: { score?: SnapshotMeta["score"] }) {
  if (!score) return <span className="text-sm text-muted-foreground">未评分</span>;
  const gradeColors: Record<string, string> = {
    A: "text-emerald-600 dark:text-emerald-400",
    B: "text-blue-600 dark:text-blue-400",
    C: "text-yellow-600 dark:text-yellow-400",
    D: "text-orange-600 dark:text-orange-400",
    F: "text-destructive",
  };
  return (
    <span className={`text-sm font-bold tabular-nums ${gradeColors[score.grade] ?? ""}`}>
      {score.total} / {score.grade}
    </span>
  );
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SnapshotListPage() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const { data: snapshots = [], isLoading } = useSnapshots();
  const { data: taps = [] } = useTaps();
  const deleteSnapshot = useDeleteSnapshot();

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`确认删除快照「${name}」？此操作不可撤销。`)) return;
    deleteSnapshot.mutate(id, {
      onSuccess: () => toast.success("快照已删除"),
      onError: (e) => toast.error(`删除失败: ${String(e)}`),
    });
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("pages.snapshots.title" as never)}</h1>
          <p className="text-muted-foreground">{t("pages.snapshots.description" as never)}</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ 创建快照</Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : snapshots.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border bg-card p-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-muted">
            <span className="text-3xl">📸</span>
          </div>
          <div>
            <p className="font-semibold">暂无快照</p>
            <p className="mt-1 text-sm text-muted-foreground">点击「创建快照」开始记录压测数据</p>
          </div>
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            + 创建快照
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {snapshots.map((snapshot, i) => (
            <motion.div
              key={snapshot.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="rounded-xl border bg-card p-4 shadow-sm flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{snapshot.name}</p>
                  <p className="text-xs text-muted-foreground">{snapshot.tapId}</p>
                </div>
                <SnapshotStatusBadge status={snapshot.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">开始</span>
                  <p className="font-medium">{formatDate(snapshot.startTime)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">时长</span>
                  <p className="font-medium">{formatDuration(snapshot.durationSec)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">评分</span>
                  <ScoreBadge score={snapshot.score} />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => void navigate(`/snapshots/${snapshot.id}`)}
                >
                  查看详情
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(snapshot.id, snapshot.name)}
                >
                  删除
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建快照</DialogTitle>
          </DialogHeader>
          <CreateSnapshotForm
            taps={taps}
            onClose={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
