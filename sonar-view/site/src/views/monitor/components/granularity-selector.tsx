import { Button } from "@/shared/shadcn/button";
import { GRANULARITY_CONFIG } from "@/lib/granularity-config";
import type { GranularityName } from "@/shared/types";

const GRANULARITY_OPTIONS: GranularityName[] = ["15s", "1m", "5m", "1h"];

interface GranularitySelectorProps {
  value: GranularityName;
  onChange: (g: GranularityName) => void;
}

export function GranularitySelector({ value, onChange }: GranularitySelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
      {GRANULARITY_OPTIONS.map((g) => (
        <Button
          key={g}
          variant={value === g ? "default" : "ghost"}
          size="sm"
          className="h-7 px-3 text-xs"
          onClick={() => onChange(g)}
        >
          {GRANULARITY_CONFIG[g].label}
          <span className="ml-1 hidden text-[10px] opacity-60 sm:inline">
            {GRANULARITY_CONFIG[g].windowLabel}
          </span>
        </Button>
      ))}
    </div>
  );
}
