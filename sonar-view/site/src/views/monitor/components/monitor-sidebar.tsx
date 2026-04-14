import { cn } from "@/shared/lib/utils";
import type { TapInstance } from "@/shared/types";

interface MonitorSidebarProps {
  taps: TapInstance[];
  isLoading: boolean;
  selectedTapId: string | null;
  onSelectTap: (id: string) => void;
}

function TapStateIndicator({ state }: { state: 1 | 2 | 3 }) {
  if (state === 1) {
    return (
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
      </span>
    );
  }
  if (state === 2) {
    return <span className="size-2.5 rounded-full bg-destructive" />;
  }
  return <span className="size-2.5 rounded-full bg-muted-foreground/50" />;
}

export function MonitorSidebar({
  taps,
  isLoading,
  selectedTapId,
  onSelectTap,
}: MonitorSidebarProps) {
  return (
    <aside className="w-52 shrink-0 border-r overflow-y-auto">
      <div className="px-3 py-4">
        <p className="mb-2 px-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Tap 实例
        </p>
        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : taps.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">暂无实例</p>
        ) : (
          <div className="space-y-0.5">
            {taps.map((tap) => (
              <button
                key={tap.id}
                type="button"
                onClick={() => onSelectTap(tap.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  selectedTapId === tap.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <TapStateIndicator state={tap.state} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-xs leading-tight">{tap.id}</p>
                  <p className="truncate text-[10px] opacity-70">{tap.appId}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
