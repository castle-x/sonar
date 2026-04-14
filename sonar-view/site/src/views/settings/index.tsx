import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/shared/shadcn/button";
import { Input } from "@/shared/shadcn/input";
import { useSettingsStore } from "@/stores/use-settings-store";
import { useTaps } from "@/shared/hooks/use-view-api";

export function SettingsPage() {
  const { t } = useTranslation("dashboard");
  const { viewServerUrl, setViewServerUrl } = useSettingsStore();
  const [urlInput, setUrlInput] = useState(viewServerUrl);
  const { data: taps = [], isLoading: tapsLoading } = useTaps();

  const handleSave = () => {
    setViewServerUrl(urlInput.trim() || "http://localhost:8283");
    toast.success("设置已保存，请刷新页面生效");
  };

  return (
    <div className="flex flex-col gap-6 px-4 py-4 md:py-6 lg:px-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("pages.settings.title" as never)}</h1>
        <p className="text-muted-foreground">{t("pages.settings.description" as never)}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border bg-card p-6"
      >
        <h2 className="mb-1 font-semibold">服务器地址</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          sonar-view 后端地址（默认 http://localhost:8283）
        </p>
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="http://localhost:8283"
            className="flex-1 font-mono text-sm"
          />
          <Button onClick={handleSave}>保存</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          当前：<code className="rounded bg-muted px-1 py-0.5">{viewServerUrl}</code>
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border bg-card p-6"
      >
        <h2 className="mb-1 font-semibold">已连接的 Tap 实例</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          来自 sonar-view 后端的 Tap 注册信息
        </p>
        {tapsLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-8 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : taps.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无 Tap 实例，请检查服务器连接</p>
        ) : (
          <ul className="space-y-2">
            {taps.map((tap) => (
              <li
                key={tap.id}
                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"
              >
                <span className="font-medium">{tap.id}</span>
                <span className="font-mono text-xs text-muted-foreground">{tap.instance}</span>
                <span
                  className={`text-xs font-medium ${
                    tap.state === 1
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {tap.state === 1 ? "在线" : tap.state === 2 ? "离线" : "未知"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    </div>
  );
}
