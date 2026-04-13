import { useState, useEffect } from "react";
import { useBlocker } from "react-router";
import { useTranslation } from "react-i18next";
import { HelpCircleIcon } from "lucide-react";
import type { ProcessExporterConfig, ProcessRule, Extract } from "@/shared/hooks/use-tap-api";
import { usePatchProcessConfig } from "@/shared/hooks/use-tap-api";
import { Input } from "@/shared/shadcn/input";
import { Label } from "@/shared/shadcn/label";
import { Switch } from "@/shared/shadcn/switch";
import { Button } from "@/shared/shadcn/button";
import { Separator } from "@/shared/shadcn/separator";
import { Badge } from "@/shared/shadcn/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/shadcn/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/shadcn/dialog";
import { TagInput } from "@/shared/wk/ui/tag-input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/shadcn/tooltip";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function FieldRow({ label, description, children, tooltip }: {
  label: string;
  description?: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircleIcon className="size-3.5 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
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

// ─── Extract editor (inside rule dialog) ─────────────────────────────────────

function ExtractEditor({ extracts, onChange, t }: {
  extracts: Extract[];
  onChange: (extracts: Extract[]) => void;
  t: (k: string) => string;
}) {
  const addExtract = () => onChange([...extracts, { labels: {} }]);
  const removeExtract = (i: number) => onChange(extracts.filter((_, idx) => idx !== i));
  const updateExtract = (i: number, patch: Partial<Extract>) =>
    onChange(extracts.map((e, idx) => idx === i ? { ...e, ...patch } : e));

  const addLabel = (i: number, key: string, val: string) => {
    if (!key.trim()) return;
    updateExtract(i, { labels: { ...extracts[i].labels, [key.trim()]: val.trim() } });
  };
  const removeLabel = (i: number, key: string) => {
    const next = { ...extracts[i].labels };
    delete next[key];
    updateExtract(i, { labels: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{t("pages.config.processExporter.extracts")}</Label>
        <Button variant="outline" size="sm" onClick={addExtract}>
          + {t("pages.config.processExporter.addExtract")}
        </Button>
      </div>

      {extracts.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">{t("pages.config.processExporter.extractsEmpty")}</p>
      )}

      {extracts.map((ext, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: extracts list
        <div key={i} className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t("pages.config.processExporter.extract")} #{i + 1}
            </span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-destructive" onClick={() => removeExtract(i)}>&times;</Button>
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t("pages.config.processExporter.extractType")}</Label>
            <Select
              value={ext.type ?? ""}
              onValueChange={(v) => updateExtract(i, { type: v ? v as Extract["type"] : undefined })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择提取方式..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="split">split — 按分隔符拆分</SelectItem>
                <SelectItem value="regex">regex — 正则捕获组</SelectItem>
              </SelectContent>
            </Select>
            {/* Type description */}
            {ext.type && (
              <p className="text-xs text-muted-foreground rounded bg-muted/50 px-2 py-1.5">
                {ext.type === "split" && t("pages.config.processExporter.extractTypeSplitDesc")}
                {ext.type === "regex" && t("pages.config.processExporter.extractTypeRegexDesc")}
              </p>
            )}
            {!ext.type && (
              <p className="text-xs text-amber-600 dark:text-amber-400 rounded bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5">
                {t("pages.config.processExporter.extractTypeRequired")}
              </p>
            )}
          </div>

          {/* split: needs sep + labels */}
          {ext.type === "split" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("pages.config.processExporter.extractSep")}</Label>
                <p className="text-xs text-muted-foreground">{t("pages.config.processExporter.extractSepDesc")}</p>
                <Input value={ext.sep ?? ""} onChange={(e) => updateExtract(i, { sep: e.target.value })} placeholder="=" className="h-8 text-xs font-mono w-24" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("pages.config.processExporter.extractLabels")}</Label>
                <p className="text-xs text-muted-foreground">{t("pages.config.processExporter.extractLabelsSplitDesc")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(ext.labels ?? {}).map(([k, v]) => (
                    <Badge key={k} variant="secondary" className="cursor-pointer text-xs" onClick={() => removeLabel(i, k)}>
                      {k}: {v} ×
                    </Badge>
                  ))}
                </div>
                <LabelAdder onAdd={(k, v) => addLabel(i, k, v)} valuePlaceholder="$2（第2段）" />
              </div>
            </>
          )}

          {/* regex: needs pattern + labels with $1/$2 */}
          {ext.type === "regex" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("pages.config.processExporter.extractPattern")}</Label>
                <p className="text-xs text-muted-foreground">{t("pages.config.processExporter.extractPatternDesc")}</p>
                <Input value={ext.pattern ?? ""} onChange={(e) => updateExtract(i, { pattern: e.target.value })} placeholder="--id=(\w+)" className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("pages.config.processExporter.extractLabels")}</Label>
                <p className="text-xs text-muted-foreground">{t("pages.config.processExporter.extractLabelsRegexDesc")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(ext.labels ?? {}).map(([k, v]) => (
                    <Badge key={k} variant="secondary" className="cursor-pointer text-xs" onClick={() => removeLabel(i, k)}>
                      {k}: {v} ×
                    </Badge>
                  ))}
                </div>
                <LabelAdder onAdd={(k, v) => addLabel(i, k, v)} valuePlaceholder="$1（第1个捕获组）" />
              </div>
            </>
          )}

          {/* auto/unset: show both sep and pattern */}
          {!ext.type && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("pages.config.processExporter.extractSep")}</Label>
                <Input value={ext.sep ?? ""} onChange={(e) => updateExtract(i, { sep: e.target.value })} placeholder="=" className="h-8 text-xs font-mono w-24" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("pages.config.processExporter.extractPattern")}</Label>
                <Input value={ext.pattern ?? ""} onChange={(e) => updateExtract(i, { pattern: e.target.value })} placeholder="--id=(\w+)" className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("pages.config.processExporter.extractLabels")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(ext.labels ?? {}).map(([k, v]) => (
                    <Badge key={k} variant="secondary" className="cursor-pointer text-xs" onClick={() => removeLabel(i, k)}>
                      {k}: {v} ×
                    </Badge>
                  ))}
                </div>
                <LabelAdder onAdd={(k, v) => addLabel(i, k, v)} valuePlaceholder="$1" />
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function LabelAdder({ onAdd, valuePlaceholder = "$1" }: { onAdd: (k: string, v: string) => void; valuePlaceholder?: string }) {
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2">
      <Input placeholder="key" value={k} onChange={(e) => setK(e.target.value)} className="h-7 text-xs w-28" />
      <Input placeholder={valuePlaceholder} value={v} onChange={(e) => setV(e.target.value)} className="h-7 text-xs w-36 font-mono" />
      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => { onAdd(k, v); setK(""); setV(""); }}>+</Button>
    </div>
  );
}

// ─── Rule dialog ──────────────────────────────────────────────────────────────

function RuleDialog({ rule, open, onClose, onSave, t }: {
  rule: ProcessRule;
  open: boolean;
  onClose: () => void;
  onSave: (r: ProcessRule) => void;
  t: (k: string) => string;
}) {
  const [draft, setDraft] = useState<ProcessRule>(rule);
  useEffect(() => setDraft(rule), [rule]);

  const update = (patch: Partial<ProcessRule>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[90vw] max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.name || t("pages.config.processExporter.rule")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <FieldRow label={t("pages.config.processExporter.ruleName")}>
            <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. GameServer" />
          </FieldRow>

          <Separator />

          {/* PID */}
          <FieldRow
            label={t("pages.config.processExporter.pid")}
            tooltip={t("pages.config.processExporter.pidDesc")}
          >
            <Input
              type="number"
              value={draft.pid ?? ""}
              onChange={(e) => update({ pid: e.target.value ? Number(e.target.value) : undefined })}
              placeholder={t("pages.config.processExporter.pidPlaceholder")}
              className="w-32"
            />
          </FieldRow>

          <Separator />

          {/* Cmdlines */}
          <FieldRow
            label={t("pages.config.processExporter.cmdlines")}
            tooltip={t("pages.config.processExporter.cmdlinesDesc")}
          >
            <TagInput
              value={draft.cmdlines ?? []}
              onChange={(tags) => update({ cmdlines: tags })}
              placeholder="dummy_server, !seed ..."
            />
          </FieldRow>

          <Separator />

          {/* Extracts */}
          <ExtractEditor
            extracts={draft.extracts ?? []}
            onChange={(extracts) => update({ extracts })}
            t={t}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("pages.settings.unsaved.stay")}</Button>
          <Button onClick={() => onSave(draft)}>{t("pages.config.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

interface Props {
  config: ProcessExporterConfig;
}

function ProcessExporterForm({ config }: Props) {
  const { t } = useTranslation("dashboard");
  const mutation = usePatchProcessConfig();

  const [enabled, setEnabled] = useState(config.enabled);
  const [dynamicInterval, setDynamicInterval] = useState(config.dynamic_interval);
  const [rules, setRules] = useState(config.rules ?? []);
  const [editingRule, setEditingRule] = useState<{ idx: number; rule: ProcessRule } | null>(null);

  const isDirty = enabled !== config.enabled ||
    dynamicInterval !== config.dynamic_interval ||
    JSON.stringify(rules) !== JSON.stringify(config.rules ?? []);

  const blocker = useBlocker(isDirty);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (isDirty) e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const addRule = () => {
    const newRule: ProcessRule = { name: "", cmdlines: [], extracts: [] };
    setRules((prev) => [...prev, newRule]);
    setEditingRule({ idx: rules.length, rule: newRule });
  };

  const removeRule = (idx: number) => setRules((prev) => prev.filter((_, i) => i !== idx));
  const saveRule = (idx: number, updated: ProcessRule) => {
    setRules((prev) => prev.map((r, i) => i === idx ? updated : r));
    setEditingRule(null);
  };

  const handleSave = () => mutation.mutate({ enabled, dynamic_interval: dynamicInterval, rules });

  return (
    <div className="max-w-2xl p-6">
      <div className="space-y-6">
        {/* Enable */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="proc-enabled" className="text-sm font-medium cursor-pointer">
              {t("pages.config.processExporter.enabled")}
            </Label>
            <p className="text-xs text-muted-foreground">{t("pages.config.processExporter.enabledDesc")}</p>
          </div>
          <Switch id="proc-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <Separator />

        {/* Dynamic interval */}
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium shrink-0">{t("pages.config.processExporter.dynamicInterval")}</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircleIcon className="size-3.5 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {t("pages.config.processExporter.dynamicIntervalDesc")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex-1" />
          <Input
            type="number"
            value={dynamicInterval}
            min={0}
            onChange={(e) => setDynamicInterval(Number(e.target.value))}
            className="w-24 text-right"
          />
        </div>

        <Separator />

        {/* Rules list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">{t("pages.config.processExporter.rules")}</Label>
              <p className="text-xs text-muted-foreground">{t("pages.config.processExporter.rulesDesc")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={addRule}>
              + {t("pages.config.addRule")}
            </Button>
          </div>

          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed">
              {t("pages.config.processExporter.rulesEmpty")}
            </p>
          ) : (
            <div className="rounded-md border divide-y">
              {rules.map((rule, idx) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: rule list
                  key={idx}
                  className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setEditingRule({ idx, rule })}
                >
                  <span className="flex-1 text-sm truncate">
                    {rule.name || <span className="text-muted-foreground italic">{t("pages.config.processExporter.rule")} #{idx + 1}</span>}
                  </span>
                  {rule.cmdlines?.length > 0 && (
                    <span className="text-xs text-muted-foreground truncate">
                      {rule.cmdlines.join(", ")}
                    </span>
                  )}
                  {rule.extracts?.length > 0 && (
                    <Badge variant="secondary" className="text-xs shrink-0">{rule.extracts.length} extracts</Badge>
                  )}
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive shrink-0"
                    onClick={(e) => { e.stopPropagation(); removeRule(idx); }}
                  >
                    <span className="text-xs">×</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={mutation.isPending}>{t("pages.config.save")}</Button>
        </div>
      </div>

      {editingRule && (
        <RuleDialog
          rule={editingRule.rule}
          open={true}
          onClose={() => setEditingRule(null)}
          onSave={(updated) => saveRule(editingRule.idx, updated)}
          t={t}
        />
      )}

      {blocker.state === "blocked" && (
        <UnsavedDialog t={t} onStay={() => blocker.reset()} onLeave={() => blocker.proceed()} />
      )}
    </div>
  );
}

export { ProcessExporterForm };
