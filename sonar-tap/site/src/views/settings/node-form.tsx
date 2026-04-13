import { useConfig } from "@/shared/hooks/use-tap-api";
import { NodeExporterForm } from "@/views/config/node-exporter-form";
import { Skeleton } from "@/shared/shadcn/skeleton";

function NodePage() {
  const { data: config, isLoading } = useConfig();
  if (isLoading || !config) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-2xl">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return <NodeExporterForm config={config.node_exporter} />;
}

export { NodePage };
