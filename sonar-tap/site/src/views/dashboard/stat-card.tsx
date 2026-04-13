import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/shadcn/card";
import { Skeleton } from "@/shared/shadcn/skeleton";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: IconSvgElement;
  isLoading?: boolean;
  status?: "ok" | "error";
}

function StatCard({ title, value, description, icon, isLoading, status }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
          <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="flex items-center gap-2">
            {status !== undefined && (
              <span
                className={`size-2 rounded-full ${
                  status === "ok" ? "bg-emerald-500" : "bg-destructive"
                }`}
              />
            )}
            <div className="text-2xl font-bold">{value}</div>
          </div>
        )}
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export { StatCard };
export type { StatCardProps };
