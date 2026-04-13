import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateClockwiseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useConfig, useReloadConfig } from "@/shared/hooks/use-tap-api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/shadcn/tabs";
import { Button } from "@/shared/shadcn/button";
import { Skeleton } from "@/shared/shadcn/skeleton";
import { PushGatewayForm } from "./push-gateway-form";
import { NodeExporterForm } from "./node-exporter-form";
import { ProcessExporterForm } from "./process-exporter-form";
import { LogConfigForm } from "./log-config-form";

function ConfigPage() {
  const { t } = useTranslation("dashboard");
  const { data: config, isLoading } = useConfig();
  const reloadMutation = useReloadConfig();
  const [activeTab, setActiveTab] = useState("push_gateway");

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
      {/* Header with reload button */}
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => reloadMutation.mutate()}
          disabled={reloadMutation.isPending}
        >
          <HugeiconsIcon icon={RotateClockwiseIcon} size={16} className={reloadMutation.isPending ? "animate-spin" : ""} />
          {t("pages.config.reload")}
        </Button>
      </div>

      {isLoading || !config ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-80 rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="push_gateway">{t("pages.config.tabs.pushGateway")}</TabsTrigger>
            <TabsTrigger value="node_exporter">{t("pages.config.tabs.nodeExporter")}</TabsTrigger>
            <TabsTrigger value="process_exporter">{t("pages.config.tabs.processExporter")}</TabsTrigger>
            <TabsTrigger value="log_config">{t("pages.config.tabs.logConfig")}</TabsTrigger>
          </TabsList>

          <TabsContent value="push_gateway" className="mt-4">
            <PushGatewayForm config={config} />
          </TabsContent>

          <TabsContent value="node_exporter" className="mt-4">
            <NodeExporterForm config={config.node_exporter} />
          </TabsContent>

          <TabsContent value="process_exporter" className="mt-4">
            <ProcessExporterForm config={config.process_exporter} />
          </TabsContent>

          <TabsContent value="log_config" className="mt-4">
            <LogConfigForm config={config.log_config} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export { ConfigPage };
