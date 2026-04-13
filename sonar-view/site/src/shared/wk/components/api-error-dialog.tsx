import { useTranslation } from "react-i18next";
import { useApiErrorStore } from "@/shared/hooks/use-api-error";
import { Button } from "@/shared/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/shadcn/dialog";

// ═══════════════════════════════════════════════════════════════════════════════
// ApiErrorDialog Component
// ═══════════════════════════════════════════════════════════════════════════════

function ApiErrorDialog() {
  const { t } = useTranslation("common");
  const { error, hide } = useApiErrorStore();

  if (!error) return null;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Dialog
      open={!!error}
      onOpenChange={(open) => {
        if (!open) hide();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-destructive">{t("apiError.title")}</DialogTitle>
          <DialogDescription>{t("apiError.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-3 text-sm">
          {/* 基本信息 */}
          <InfoRow
            label={t("apiError.method")}
            value={error.method}
          />
          <InfoRow
            label={t("apiError.status")}
            value={`${error.status} ${error.statusText}`}
            highlight={error.status >= 400}
          />
          <InfoRow
            label={t("apiError.url")}
            value={error.url}
            mono
          />
          <InfoRow
            label={t("apiError.time")}
            value={formatTime(error.timestamp)}
          />

          {/* 请求参数 */}
          {error.requestPayload !== undefined && (
            <div className="space-y-1">
              <div className="font-medium text-foreground">{t("apiError.requestPayload")}</div>
              <CodeBlock content={JSON.stringify(error.requestPayload, null, 2)} />
            </div>
          )}

          {/* 响应内容 */}
          {error.responseBody !== undefined && (
            <div className="space-y-1">
              <div className="font-medium text-foreground">{t("apiError.responseBody")}</div>
              <CodeBlock content={JSON.stringify(error.responseBody, null, 2)} />
            </div>
          )}

          {/* 原始错误 */}
          <div className="space-y-1">
            <div className="font-medium text-foreground">{t("apiError.rawError")}</div>
            <CodeBlock
              content={error.rawError}
              className="max-h-32"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={hide}
          >
            {t("close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}

function InfoRow({ label, value, mono, highlight }: InfoRowProps) {
  return (
    <div className="flex items-start gap-2">
      <span className="min-w-24 shrink-0 text-muted-foreground">{label}</span>
      <span
        className={`break-all ${mono ? "font-mono text-xs" : ""} ${highlight ? "font-medium text-destructive" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

interface CodeBlockProps {
  content: string;
  className?: string;
}

function CodeBlock({ content, className }: CodeBlockProps) {
  return (
    <pre
      className={`max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs ${className || ""}`}
    >
      {content}
    </pre>
  );
}

export { ApiErrorDialog };
