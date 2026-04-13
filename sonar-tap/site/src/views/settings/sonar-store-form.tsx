import { useState, useEffect } from "react";
import { useBlocker } from "react-router";
import { useTranslation } from "react-i18next";
import type { TapConfig } from "@/shared/hooks/use-tap-api";
import { usePatchSonarStore, useConfig } from "@/shared/hooks/use-tap-api";
import { Input } from "@/shared/shadcn/input";
import { Label } from "@/shared/shadcn/label";
import { Switch } from "@/shared/shadcn/switch";
import { Button } from "@/shared/shadcn/button";
import { Separator } from "@/shared/shadcn/separator";
import { Skeleton } from "@/shared/shadcn/skeleton";

function SonarStoreForm() {
  const { data: config, isLoading } = useConfig();

  if (isLoading || !config) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-2xl">
        {Array.from({ length: 5 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return <SonarStoreFormInner config={config} />;
}

interface FieldRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function FieldRow({ label, description, children }: FieldRowProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

interface SwitchRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}

function SwitchRow({ id, label, description, checked, onCheckedChange }: SwitchRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SonarStoreFormInner({ config }: { config: TapConfig }) {
  const { t } = useTranslation("dashboard");
  const mutation = usePatchSonarStore();

  const [step, setStep] = useState(config.step);
  const [appId, setAppId] = useState(config.sonar_store.app_id);
  const [host, setHost] = useState(config.sonar_store.host);
  const [enabled, setEnabled] = useState(config.sonar_store.enabled);
  const [reqTimeout, setReqTimeout] = useState(config.sonar_store.req_timeout);
  const [reportInterval, setReportInterval] = useState(config.sonar_store.report_interval);
  const [bufSize, setBufSize] = useState(config.sonar_store.buf_size);
  const [channelSize, setChannelSize] = useState(config.sonar_store.channel_size);
  const [printMetrics, setPrintMetrics] = useState(config.sonar_store.print_metrics);

  const isDirty =
    step !== config.step ||
    appId !== config.sonar_store.app_id ||
    host !== config.sonar_store.host ||
    enabled !== config.sonar_store.enabled ||
    reqTimeout !== config.sonar_store.req_timeout ||
    reportInterval !== config.sonar_store.report_interval ||
    bufSize !== config.sonar_store.buf_size ||
    channelSize !== config.sonar_store.channel_size ||
    printMetrics !== config.sonar_store.print_metrics;

  // Block in-app navigation when dirty
  const blocker = useBlocker(isDirty);

  // Block browser refresh/close when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleSave = () => {
    mutation.mutate({
      ...config,
      step,
      sonar_store: {
        ...config.sonar_store,
        app_id: appId,
        host,
        enabled,
        req_timeout: reqTimeout,
        report_interval: reportInterval,
        buf_size: bufSize,
        channel_size: channelSize,
        print_metrics: printMetrics,
      },
    });
  };

  return (
    <div className="max-w-2xl p-6">
      <div className="space-y-6">
        {/* Toggles */}
        <SwitchRow
          id="ss-enabled"
          label={t("pages.settings.sonarStore.enabled")}
          description={t("pages.settings.sonarStore.enabledDesc")}
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Separator />
        <SwitchRow
          id="ss-print"
          label={t("pages.settings.sonarStore.printMetrics")}
          description={t("pages.settings.sonarStore.printMetricsDesc")}
          checked={printMetrics}
          onCheckedChange={setPrintMetrics}
        />
        <Separator />

        {/* Connection */}
        <FieldRow label={t("pages.settings.sonarStore.host")} description={t("pages.settings.sonarStore.hostDesc")}>
          <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="http://localhost:8082" className="max-w-md" />
        </FieldRow>
        <Separator />

        <FieldRow label={t("pages.settings.sonarStore.appId")} description={t("pages.settings.sonarStore.appIdDesc")}>
          <Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="my-app" className="max-w-md" />
        </FieldRow>
        <Separator />

        {/* Numeric fields — 2 per row */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-6">
          <FieldRow label={t("pages.settings.sonarStore.step")} description={t("pages.settings.sonarStore.stepDesc")}>
            <Input type="number" value={step} min={1} onChange={(e) => setStep(Number(e.target.value))} className="w-full" />
          </FieldRow>
          <FieldRow label={t("pages.settings.sonarStore.reportInterval")} description={t("pages.settings.sonarStore.reportIntervalDesc")}>
            <Input type="number" value={reportInterval} min={1} onChange={(e) => setReportInterval(Number(e.target.value))} className="w-full" />
          </FieldRow>
          <FieldRow label={t("pages.settings.sonarStore.reqTimeout")} description={t("pages.settings.sonarStore.reqTimeoutDesc")}>
            <Input type="number" value={reqTimeout} min={1} onChange={(e) => setReqTimeout(Number(e.target.value))} className="w-full" />
          </FieldRow>
          <FieldRow label={t("pages.settings.sonarStore.bufSize")} description={t("pages.settings.sonarStore.bufSizeDesc")}>
            <Input type="number" value={bufSize} min={1} onChange={(e) => setBufSize(Number(e.target.value))} className="w-full" />
          </FieldRow>
          <FieldRow label={t("pages.settings.sonarStore.channelSize")} description={t("pages.settings.sonarStore.channelSizeDesc")}>
            <Input type="number" value={channelSize} min={1} onChange={(e) => setChannelSize(Number(e.target.value))} className="w-full" />
          </FieldRow>
        </div>

        {/* Save button — right aligned */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {t("pages.config.save")}
          </Button>
        </div>
      </div>

      {/* Unsaved changes blocker dialog */}
      {blocker.state === "blocked" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-card p-6 shadow-lg space-y-4 border">
            <h3 className="text-base font-semibold">{t("pages.settings.unsaved.title")}</h3>
            <p className="text-sm text-muted-foreground">{t("pages.settings.unsaved.desc")}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => blocker.reset()}>
                {t("pages.settings.unsaved.stay")}
              </Button>
              <Button variant="destructive" onClick={() => blocker.proceed()}>
                {t("pages.settings.unsaved.leave")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { SonarStoreForm };
