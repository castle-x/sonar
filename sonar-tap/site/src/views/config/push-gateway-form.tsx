import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TapConfig } from "@/shared/hooks/use-tap-api";
import { usePatchPushGateway } from "@/shared/hooks/use-tap-api";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/shared/shadcn/card";
import { Input } from "@/shared/shadcn/input";
import { Label } from "@/shared/shadcn/label";
import { Switch } from "@/shared/shadcn/switch";
import { Button } from "@/shared/shadcn/button";

interface Props {
  config: TapConfig;
}

function PushGatewayForm({ config }: Props) {
  const { t } = useTranslation("dashboard");
  const mutation = usePatchPushGateway();

  const [step, setStep] = useState(config.step);
  const [appId, setAppId] = useState(config.push_gateway.app_id);
  const [host, setHost] = useState(config.push_gateway.host);
  const [enabled, setEnabled] = useState(config.push_gateway.enabled);
  const [reqTimeout, setReqTimeout] = useState(config.push_gateway.req_timeout);
  const [reportInterval, setReportInterval] = useState(config.push_gateway.report_interval);
  const [bufSize, setBufSize] = useState(config.push_gateway.buf_size);
  const [channelSize, setChannelSize] = useState(config.push_gateway.channel_size);
  const [printMetrics, setPrintMetrics] = useState(config.push_gateway.print_metrics);

  const handleSave = () => {
    mutation.mutate({
      ...config,
      step,
      push_gateway: {
        ...config.push_gateway,
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
    <Card>
      <CardHeader>
        <CardTitle>{t("pages.config.pushGateway.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("pages.config.pushGateway.host")}</Label>
          <Input value={host} onChange={(e) => setHost(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("pages.config.pushGateway.appId")}</Label>
          <Input value={appId} onChange={(e) => setAppId(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("pages.config.pushGateway.step")}</Label>
          <Input type="number" value={step} onChange={(e) => setStep(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>{t("pages.config.pushGateway.reportInterval")}</Label>
          <Input type="number" value={reportInterval} onChange={(e) => setReportInterval(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>{t("pages.config.pushGateway.reqTimeout")}</Label>
          <Input type="number" value={reqTimeout} onChange={(e) => setReqTimeout(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>{t("pages.config.pushGateway.bufSize")}</Label>
          <Input type="number" value={bufSize} onChange={(e) => setBufSize(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label>{t("pages.config.pushGateway.channelSize")}</Label>
          <Input type="number" value={channelSize} onChange={(e) => setChannelSize(Number(e.target.value))} />
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={enabled} onCheckedChange={setEnabled} id="pg-enabled" />
          <Label htmlFor="pg-enabled">{t("pages.config.pushGateway.enabled")}</Label>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={printMetrics} onCheckedChange={setPrintMetrics} id="pg-print" />
          <Label htmlFor="pg-print">{t("pages.config.pushGateway.printMetrics")}</Label>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {t("pages.config.save")}
        </Button>
      </CardFooter>
    </Card>
  );
}

export { PushGatewayForm };
