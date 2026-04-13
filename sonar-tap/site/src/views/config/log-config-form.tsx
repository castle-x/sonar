import { useState, useEffect } from "react";
import { useBlocker } from "react-router";
import { useTranslation } from "react-i18next";
import { HelpCircleIcon } from "lucide-react";
import type { LogConfigItem, MetricConfigItem, ProcessRule, WatchConfig } from "@/shared/hooks/use-tap-api";
import { usePatchLogConfig, useDebugRegex } from "@/shared/hooks/use-tap-api";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/shadcn/tooltip";
import { TagInput } from "@/shared/wk/ui/tag-input";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function FieldRow({ label, description, tooltip, children }: {
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

function SectionLabel({ label }: { label: string }) {
  return <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">{label}</p>;
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

// ─── Label KV adder ──────────────────────────────────────────────────────────

function LabelKVAdder({ labels, onChange }: {
  labels: Record<string, string>;
  onChange: (labels: Record<string, string>) => void;
}) {
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  const add = () => {
    if (!k.trim()) return;
    onChange({ ...labels, [k.trim()]: v.trim() });
    setK(""); setV("");
  };
  const remove = (key: string) => {
    const next = { ...labels };
    delete next[key];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(labels ?? {}).map(([key, val]) => (
          <Badge key={key} variant="secondary" className="cursor-pointer text-xs" onClick={() => remove(key)}>
            {key}: {val} ×
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="key" value={k} onChange={(e) => setK(e.target.value)} className="h-7 text-xs w-28" />
        <Input placeholder="value" value={v} onChange={(e) => setV(e.target.value)} className="h-7 text-xs w-36" />
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={add}>+</Button>
      </div>
    </div>
  );
}

// ─── Rule mini-dialog (process matching rule inside log group) ────────────────

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
      <DialogContent className="w-[90vw] max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.name || t("pages.config.processExporter.rule")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <FieldRow label={t("pages.config.processExporter.ruleName")}>
            <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. GameServer" />
          </FieldRow>
          <Separator />
          <FieldRow label={t("pages.config.processExporter.cmdlines")} tooltip={t("pages.config.processExporter.cmdlinesDesc")}>
            <TagInput value={draft.cmdlines ?? []} onChange={(tags) => update({ cmdlines: tags })} placeholder="dummy_server, !seed ..." />
          </FieldRow>
          <Separator />
          <FieldRow label={t("pages.config.processExporter.logPathPattern")} tooltip={t("pages.config.processExporter.logPathPatternDesc")}>
            <Input
              value={draft.log_path_pattern ?? ""}
              onChange={(e) => update({ log_path_pattern: e.target.value || undefined })}
              placeholder="-LOG=(.+\.log)"
              className="font-mono text-xs"
            />
          </FieldRow>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("pages.settings.unsaved.stay")}</Button>
          <Button onClick={() => onSave(draft)}>{t("pages.config.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Metric dialog ────────────────────────────────────────────────────────────

function MetricDialog({ metric, open, onClose, onSave, t }: {
  metric: MetricConfigItem;
  open: boolean;
  onClose: () => void;
  onSave: (m: MetricConfigItem) => void;
  t: (k: string) => string;
}) {
  const [draft, setDraft] = useState<MetricConfigItem>(metric);
  const debugMutation = useDebugRegex();
  const [debugResult, setDebugResult] = useState<string | null>(null);
  const [debugInput, setDebugInput] = useState("");

  useEffect(() => { setDraft(metric); setDebugResult(null); setDebugInput(""); }, [metric]);

  const update = (patch: Partial<MetricConfigItem>) => setDraft((prev) => ({ ...prev, ...patch }));

  const handleDebug = () => {
    debugMutation.mutate(
      { pattern: draft.pattern, input: debugInput },
      {
        onSuccess: (res) => {
          if (res.matched) {
            const groups = res.groups?.map((g, i) => `$${i + 1}: ${g}`).join("\n") ?? "";
            setDebugResult(`✅ 匹配成功\n${groups}`);
          } else {
            setDebugResult(res.error ? `❌ 错误: ${res.error}` : "❌ 未匹配");
          }
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[90vw] max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.name || t("pages.config.logConfig.addMetric")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between gap-4">
            <Label className="text-sm font-medium">{t("pages.config.logConfig.enabled")}</Label>
            <Switch checked={draft.enabled} onCheckedChange={(v) => update({ enabled: v })} />
          </div>

          <Separator />

          <FieldRow label={t("pages.config.logConfig.metricName")}>
            <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="e.g. avg_fps" />
          </FieldRow>

          <FieldRow label={t("pages.config.logConfig.metricHelp")} tooltip={t("pages.config.logConfig.metricHelpDesc")}>
            <Input value={draft.help ?? ""} onChange={(e) => update({ help: e.target.value || undefined })} placeholder="e.g. Average FPS of game server" />
          </FieldRow>

          <Separator />

          <FieldRow label={t("pages.config.logConfig.pattern")} description={t("pages.config.logConfig.patternDesc")}>
            <Input value={draft.pattern} onChange={(e) => update({ pattern: e.target.value })} className="font-mono text-xs" placeholder="AverageFps:(\d+)" />
          </FieldRow>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("pages.config.logConfig.debugInput")}</Label>
            <div className="flex gap-2">
              <Input value={debugInput} onChange={(e) => setDebugInput(e.target.value)} placeholder="e.g. AverageFps:60" className="font-mono text-xs flex-1" />
              <Button variant="outline" size="sm" onClick={handleDebug} disabled={!draft.pattern || debugMutation.isPending}>
                {t("pages.debug.run")}
              </Button>
            </div>
            {debugResult && <pre className="text-xs rounded bg-muted p-2 whitespace-pre-wrap">{debugResult}</pre>}
          </div>

          <Separator />

          <FieldRow label={t("pages.config.logConfig.metricValue")} tooltip={t("pages.config.logConfig.metricValueDesc")}>
            <Input value={draft.value} onChange={(e) => update({ value: e.target.value })} placeholder="$1" className="w-28 font-mono text-xs" />
          </FieldRow>

          <Separator />

          <FieldRow label={t("pages.config.logConfig.density")} description={t("pages.config.logConfig.densityDesc")}>
            <Input type="number" value={draft.density} onChange={(e) => update({ density: Number(e.target.value) })} className="w-28" min={0} />
          </FieldRow>

          <Separator />

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">{t("pages.config.logConfig.minuteCount")}</Label>
              <p className="text-xs text-muted-foreground">{t("pages.config.logConfig.minuteCountDesc")}</p>
            </div>
            <Switch checked={draft.is_record_minute_count} onCheckedChange={(v) => update({ is_record_minute_count: v })} />
          </div>

          <Separator />

          <FieldRow label={t("pages.config.logConfig.timestamp")} tooltip={t("pages.config.logConfig.timestampDesc")}>
            <Input value={draft.timestamp ?? ""} onChange={(e) => update({ timestamp: e.target.value || undefined })} placeholder="$2" className="w-28 font-mono text-xs" />
          </FieldRow>

          <FieldRow label={t("pages.config.logConfig.timestampFormat")} tooltip={t("pages.config.logConfig.timestampFormatDesc")}>
            <Input value={draft.timestamp_format ?? ""} onChange={(e) => update({ timestamp_format: e.target.value || undefined })} placeholder="2006-01-02 15:04:05" className="font-mono text-xs" />
          </FieldRow>

          <FieldRow label={t("pages.config.logConfig.metricTimeZone")} tooltip={t("pages.config.logConfig.metricTimeZoneDesc")}>
            <Input value={draft.time_zone ?? ""} onChange={(e) => update({ time_zone: e.target.value || undefined })} placeholder="Asia/Shanghai" className="w-40" />
          </FieldRow>

          <Separator />

          <FieldRow label={t("pages.config.logConfig.metricLabels")} description={t("pages.config.logConfig.metricLabelsDesc")}>
            <LabelKVAdder
              labels={draft.labels ?? {}}
              onChange={(labels) => update({ labels: Object.keys(labels).length > 0 ? labels : undefined })}
            />
          </FieldRow>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("pages.settings.unsaved.stay")}</Button>
          <Button onClick={() => onSave(draft)}>{t("pages.config.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Log group card (flat, no dialog) ────────────────────────────────────────

interface LogGroupCardProps {
  item: LogConfigItem;
  onChange: (patch: Partial<LogConfigItem>) => void;
  onRemove: () => void;
  t: (k: string) => string;
}

function LogGroupCard({ item, onChange, onRemove, t }: LogGroupCardProps) {
  const [editingMetric, setEditingMetric] = useState<{ idx: number; metric: MetricConfigItem } | null>(null);
  const [editingRule, setEditingRule] = useState<{ idx: number; rule: ProcessRule } | null>(null);

  // Fix 1: use local state so toggling path→process→path works correctly
  const [sourceMode, setSourceModeState] = useState<"path" | "process">(
    (item.rules ?? []).length > 0 ? "process" : "path"
  );
  const setSourceMode = (mode: "path" | "process") => {
    setSourceModeState(mode);
    if (mode === "path") {
      onChange({ rules: [] });
    } else {
      onChange({ file_path: undefined });
    }
  };

  const updateWatch = (patch: Partial<WatchConfig>) =>
    onChange({ watch: { ...item.watch, ...patch } });

  // Rules
  const addRule = () => {
    const r: ProcessRule = { name: "", cmdlines: [], extracts: [] };
    const rules = [...(item.rules ?? []), r];
    onChange({ rules });
    setEditingRule({ idx: rules.length - 1, rule: r });
  };
  const removeRule = (i: number) => onChange({ rules: (item.rules ?? []).filter((_, idx) => idx !== i) });
  const saveRule = (i: number, r: ProcessRule) => {
    onChange({ rules: (item.rules ?? []).map((old, idx) => idx === i ? r : old) });
    setEditingRule(null);
  };

  // Metrics
  const addMetric = () => {
    const m: MetricConfigItem = { name: "", pattern: "", value: "$1", density: 5, enabled: true, is_record_minute_count: false };
    const metrics = [...(item.metrics ?? []), m];
    onChange({ metrics });
    setEditingMetric({ idx: metrics.length - 1, metric: m });
  };
  const removeMetric = (i: number) => onChange({ metrics: item.metrics.filter((_, idx) => idx !== i) });
  const saveMetric = (i: number, m: MetricConfigItem) => {
    onChange({ metrics: item.metrics.map((old, idx) => idx === i ? m : old) });
    setEditingMetric(null);
  };

  return (
    <div className="rounded-lg border space-y-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Input
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="border-0 shadow-none px-0 text-sm font-medium focus-visible:ring-0 bg-transparent flex-1 h-auto"
          placeholder={t("pages.config.logConfig.name")}
        />
        <Switch checked={item.enabled} onCheckedChange={(v) => onChange({ enabled: v })} />
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive text-xs h-7 px-2" onClick={onRemove}>
          {t("pages.config.logConfig.removeGroup")}
        </Button>
      </div>

      <Separator />

      {/* Log source */}
      <div className="px-4 py-4 space-y-4">
        <SectionLabel label={t("pages.config.logConfig.sourceSection")} />

        {/* Mode toggle + dynamic interval on same row */}
        <div className="flex items-center gap-4">
          <div className="flex rounded-md border overflow-hidden w-fit shrink-0">
            <button
              type="button"
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${sourceMode === "path" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
              onClick={() => setSourceMode("path")}
            >
              {t("pages.config.logConfig.sourceModePath")}
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l ${sourceMode === "process" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-muted"}`}
              onClick={() => setSourceMode("process")}
            >
              {t("pages.config.logConfig.sourceModeProcess")}
            </button>
          </div>
          {sourceMode === "process" && (
            <div className="flex items-center gap-2 ml-auto">
              <Label className="text-xs text-muted-foreground shrink-0">{t("pages.config.logConfig.dynamicInterval")}</Label>
              <Input
                type="number"
                value={item.dynamic_interval}
                min={0}
                onChange={(e) => onChange({ dynamic_interval: Number(e.target.value) })}
                className="w-20 h-8 text-xs"
              />
            </div>
          )}
        </div>

        {sourceMode === "path" && (
          <FieldRow label={t("pages.config.logConfig.filePath")} tooltip={t("pages.config.logConfig.filePathDesc")}>
            <Input
              value={item.file_path ?? ""}
              onChange={(e) => onChange({ file_path: e.target.value || undefined })}
              placeholder="/var/log/game/*.log"
              className="font-mono text-xs"
            />
          </FieldRow>
        )}

        {sourceMode === "process" && (
          <>
            {/* Process matching rules */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{t("pages.config.logConfig.rules")}</Label>
                <Button variant="outline" size="sm" onClick={addRule}>+ {t("pages.config.addRule")}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("pages.config.logConfig.rulesDesc")}</p>
              {(item.rules ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center rounded border border-dashed">{t("pages.config.logConfig.rulesEmpty")}</p>
              ) : (
                <div className="rounded-md border divide-y">
                  {(item.rules ?? []).map((rule, i) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: rule list
                      key={i}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setEditingRule({ idx: i, rule })}
                    >
                      <span className="flex-1 text-sm truncate">
                        {rule.name || <span className="text-muted-foreground italic">{t("pages.config.processExporter.rule")} #{i + 1}</span>}
                      </span>
                      {rule.cmdlines?.length > 0 && (
                        <span className="text-xs text-muted-foreground truncate">{rule.cmdlines.join(", ")}</span>
                      )}
                      {rule.log_path_pattern && (
                        <Badge variant="secondary" className="text-xs shrink-0">log path</Badge>
                      )}
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive shrink-0"
                        onClick={(e) => { e.stopPropagation(); removeRule(i); }}
                      >
                        <span className="text-xs">×</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Separator />

      {/* Read options */}
      <div className="px-4 py-4 space-y-4">
        <SectionLabel label={t("pages.config.logConfig.readOptions")} />

        {/* Fix 2: 2×2 grid */}
        <div className="grid grid-cols-2 gap-4">
          <FieldRow label={t("pages.config.logConfig.readMode")} tooltip={t("pages.config.logConfig.readModeDesc")}>
            <Select
              value={item.read_mode || "tail"}
              onValueChange={(v) => onChange({ read_mode: v === "tail" ? undefined : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tail">tail — 从文件末尾</SelectItem>
                <SelectItem value="head">head — 从文件开头</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label={t("pages.config.logConfig.encoding")} tooltip={t("pages.config.logConfig.encodingDesc")}>
            <Input value={item.encoding ?? ""} onChange={(e) => onChange({ encoding: e.target.value || undefined })} placeholder="utf-8" />
          </FieldRow>

          <FieldRow label={t("pages.config.logConfig.maxFileSizeMb")} tooltip={t("pages.config.logConfig.maxFileSizeMbDesc")}>
            <Input type="number" value={item.max_file_size_mb ?? 0} min={0} onChange={(e) => onChange({ max_file_size_mb: Number(e.target.value) || undefined })} />
          </FieldRow>

          <FieldRow label={t("pages.config.logConfig.timeZone")} tooltip={t("pages.config.logConfig.timeZoneDesc")}>
            <Input value={item.time_zone ?? ""} onChange={(e) => onChange({ time_zone: e.target.value || undefined })} placeholder="Asia/Shanghai" />
          </FieldRow>
        </div>
      </div>

      <Separator />

      {/* Watch config */}
      <div className="px-4 py-4 space-y-4">
        <SectionLabel label={t("pages.config.logConfig.watchConfig")} />

        {/* Fix 3: poll interval + rotate check interval + max retries in one row */}
        <div className="grid grid-cols-3 gap-4">
          <FieldRow label={t("pages.config.logConfig.watchPollInterval")} tooltip={t("pages.config.logConfig.watchPollIntervalDesc")}>
            <Input value={item.watch?.poll_interval ?? ""} onChange={(e) => updateWatch({ poll_interval: e.target.value || undefined })} placeholder="1s" />
          </FieldRow>

          <FieldRow label={t("pages.config.logConfig.watchRotateCheckInterval")} tooltip={t("pages.config.logConfig.watchRotateCheckIntervalDesc")}>
            <Input value={item.watch?.rotate_check_interval ?? ""} onChange={(e) => updateWatch({ rotate_check_interval: e.target.value || undefined })} placeholder="5s" />
          </FieldRow>

          <FieldRow label={t("pages.config.logConfig.watchMaxRetries")} tooltip={t("pages.config.logConfig.watchMaxRetriesDesc")}>
            <Input type="number" value={item.watch?.max_retries ?? 0} min={0} onChange={(e) => updateWatch({ max_retries: Number(e.target.value) || undefined })} />
          </FieldRow>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">{t("pages.config.logConfig.watchUseInotify")}</Label>
            <p className="text-xs text-muted-foreground">{t("pages.config.logConfig.watchUseInotifyDesc")}</p>
          </div>
          <Switch checked={item.watch?.use_inotify ?? false} onCheckedChange={(v) => updateWatch({ use_inotify: v })} />
        </div>
      </div>

      <Separator />

      {/* Metrics list */}
      <div className="px-4 py-4 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("pages.config.logConfig.metrics")}</Label>
          <Button variant="outline" size="sm" onClick={addMetric}>+ {t("pages.config.logConfig.addMetric")}</Button>
        </div>

        {(item.metrics ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center rounded border border-dashed">{t("pages.config.logConfig.metricsEmpty")}</p>
        ) : (
          <div className="rounded-md border divide-y">
            {item.metrics.map((m, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: metric list
                key={i}
                className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 cursor-pointer"
                onClick={() => setEditingMetric({ idx: i, metric: m })}
              >
                <span className="flex-1 text-sm truncate">
                  {m.name || <span className="text-muted-foreground italic">{t("pages.config.logConfig.addMetric")} #{i + 1}</span>}
                </span>
                {m.pattern && <span className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">{m.pattern}</span>}
                <Badge variant={m.enabled ? "default" : "secondary"} className="text-xs shrink-0">
                  {m.enabled ? "ON" : "OFF"}
                </Badge>
                {m.is_record_minute_count && (
                  <Badge variant="outline" className="text-xs shrink-0">count/min</Badge>
                )}
                <Button
                  variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive shrink-0"
                  onClick={(e) => { e.stopPropagation(); removeMetric(i); }}
                >
                  <span className="text-xs">×</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {editingMetric && (
        <MetricDialog
          metric={editingMetric.metric}
          open={true}
          onClose={() => setEditingMetric(null)}
          onSave={(m) => saveMetric(editingMetric.idx, m)}
          t={t}
        />
      )}
      {editingRule && (
        <RuleDialog
          rule={editingRule.rule}
          open={true}
          onClose={() => setEditingRule(null)}
          onSave={(r) => saveRule(editingRule.idx, r)}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

interface Props {
  config: LogConfigItem[];
}

function LogConfigForm({ config }: Props) {
  const { t } = useTranslation("dashboard");
  const mutation = usePatchLogConfig();
  const [items, setItems] = useState<LogConfigItem[]>(config ?? []);

  const isDirty = JSON.stringify(items) !== JSON.stringify(config ?? []);
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (isDirty) e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const updateItem = (idx: number, patch: Partial<LogConfigItem>) =>
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));

  const addItem = () =>
    setItems((prev) => [...prev, {
      name: `LogConfig${prev.length + 1}`,
      enabled: true,
      dynamic_interval: 5,
      rules: [],
      metrics: [],
    }]);

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = () => mutation.mutate(items);

  return (
    <div className="max-w-2xl p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">{t("pages.config.logConfig.title")}</Label>
            <p className="text-xs text-muted-foreground">{t("pages.config.logConfig.desc")}</p>
          </div>
          <Button variant="outline" size="sm" onClick={addItem}>
            + {t("pages.config.logConfig.addGroup")}
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center rounded-lg border border-dashed">
            {t("pages.config.logConfig.empty")}
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: log config groups
              <LogGroupCard
                key={idx}
                item={item}
                onChange={(patch) => updateItem(idx, patch)}
                onRemove={() => removeItem(idx)}
                t={t}
              />
            ))}
          </div>
        )}

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

export { LogConfigForm };
