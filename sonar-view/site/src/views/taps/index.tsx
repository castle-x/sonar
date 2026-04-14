import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { useTaps } from "@/shared/hooks/use-view-api";

function TapStateLabel({ state }: { state: 1 | 2 | 3 }) {
  if (state === 1) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
      在线
    </span>
  );
  if (state === 2) return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">
      <span className="size-1.5 rounded-full bg-destructive" />
      离线
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      未知
    </span>
  );
}

function formatLastScrape(ts: number): string {
  if (!ts) return "—";
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s 前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m 前`;
  return new Date(ts * 1000).toLocaleString("zh-CN");
}

export function TapListPage() {
  const { t } = useTranslation("dashboard");
  const { data: taps = [], isLoading, refetch } = useTaps();

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("pages.taps.title" as never)}</h1>
          <p className="text-muted-foreground">{t("pages.taps.description" as never)}</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-lg border bg-card px-3 py-1.5 text-sm hover:bg-muted transition-colors"
        >
          刷新
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : taps.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border bg-card p-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-muted">
            <span className="text-3xl">🖥</span>
          </div>
          <div>
            <p className="font-semibold">暂无 Tap 实例</p>
            <p className="mt-1 text-sm text-muted-foreground">
              请在设置中配置 sonar-view 连接后刷新
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  ID
                </th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  App ID
                </th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  地址
                </th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  状态
                </th>
                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  最后上报
                </th>
              </tr>
            </thead>
            <tbody>
              {taps.map((tap, i) => (
                <motion.tr
                  key={tap.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{tap.id}</td>
                  <td className="px-4 py-3 text-muted-foreground">{tap.appId}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tap.instance}</td>
                  <td className="px-4 py-3">
                    <TapStateLabel state={tap.state} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatLastScrape(tap.lastScrape)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
