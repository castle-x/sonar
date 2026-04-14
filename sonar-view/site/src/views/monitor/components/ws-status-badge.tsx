import { cn } from "@/shared/lib/utils";
import type { WSConnectionStatus } from "@/shared/types";

interface WSStatusBadgeProps {
  status: WSConnectionStatus;
}

const STATUS_CONFIG: Record<WSConnectionStatus, { label: string; className: string }> = {
  connected: { label: "已连接", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  connecting: { label: "连接中...", className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400" },
  disconnected: { label: "已断开", className: "bg-muted text-muted-foreground" },
  error: { label: "连接错误", className: "bg-destructive/15 text-destructive" },
};

export function WSStatusBadge({ status }: WSStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        config.className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "connected" ? "bg-emerald-500 animate-pulse" : "bg-current",
        )}
      />
      WS · {config.label}
    </span>
  );
}
