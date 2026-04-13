import { useState, useEffect } from "react";
import { useBlocker } from "react-router";
import { useTranslation } from "react-i18next";
import type { NodeExporterConfig } from "@/shared/hooks/use-tap-api";
import { usePatchNodeConfig } from "@/shared/hooks/use-tap-api";
import { Input } from "@/shared/shadcn/input";
import { Label } from "@/shared/shadcn/label";
import { Switch } from "@/shared/shadcn/switch";
import { Button } from "@/shared/shadcn/button";
import { Badge } from "@/shared/shadcn/badge";
import { Separator } from "@/shared/shadcn/separator";

interface FieldRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function FieldRow({ label, description, children }: FieldRowProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

function UnsavedDialog({ onStay, onLeave, t }: { onStay: () => void; onLeave: () => void; t: (k: string) => string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-card p-6 shadow-lg space-y-4 border">
        <h3 className="text-base font-semibold">{t("pages.settings.unsaved.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("pages.settings.unsaved.desc")}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onStay}>{t("pages.settings.unsaved.stay")}</Button>
          <Button variant="destructive" onClick={onLeave}>{t("pages.settings.unsaved.leave")}</Button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  config: NodeExporterConfig;
}

function NodeExporterForm({ config }: Props) {
  const { t } = useTranslation("dashboard");
  const mutation = usePatchNodeConfig();

  const [enabled, setEnabled] = useState(config.enabled);
  const [labels, setLabels] = useState(config.labels ?? {});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const isDirty = enabled !== config.enabled ||
    JSON.stringify(labels) !== JSON.stringify(config.labels ?? {});

  const blocker = useBlocker(isDirty);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (isDirty) e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const addLabel = () => {
    if (!newKey.trim()) return;
    setLabels((prev) => ({ ...prev, [newKey.trim()]: newValue.trim() }));
    setNewKey("");
    setNewValue("");
  };

  const removeLabel = (key: string) => {
    setLabels((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const handleSave = () => mutation.mutate({ enabled, labels });

  return (
    <div className="max-w-2xl p-6">
      <div className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="node-enabled" className="text-sm font-medium cursor-pointer">
              {t("pages.config.nodeExporter.enabled")}
            </Label>
            <p className="text-xs text-muted-foreground">{t("pages.config.nodeExporter.enabledDesc")}</p>
          </div>
          <Switch id="node-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <Separator />

        {/* Labels */}
        <FieldRow label={t("pages.config.labels")} description={t("pages.config.nodeExporter.labelsDesc")}>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 min-h-[1.5rem]">
              {Object.entries(labels).map(([k, v]) => (
                <Badge key={k} variant="secondary" className="cursor-pointer gap-1" onClick={() => removeLabel(k)}>
                  {k}={v} &times;
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="key" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="w-32" />
              <Input placeholder="value" value={newValue} onChange={(e) => setNewValue(e.target.value)} className="w-32" />
              <Button variant="outline" size="sm" onClick={addLabel}>+</Button>
            </div>
          </div>
        </FieldRow>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={mutation.isPending}>{t("pages.config.save")}</Button>
        </div>
      </div>

      {blocker.state === "blocked" && (
        <UnsavedDialog t={t} onStay={() => blocker.reset()} onLeave={() => blocker.proceed()} />
      )}
    </div>
  );
}

export { NodeExporterForm };
