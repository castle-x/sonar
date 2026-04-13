import { useConfig } from "@/shared/hooks/use-tap-api";
import { LogConfigForm } from "@/views/config/log-config-form";
import { Skeleton } from "@/shared/shadcn/skeleton";

function LogPage() {
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
  return <LogConfigForm config={config.log_config} />;
}

export { LogPage };
