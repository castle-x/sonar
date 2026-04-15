import { cn } from "@/shared/lib/utils";
import type { StoreConfig } from "@/api/sonar-view/store-config/v1/types";

interface MonitorSidebarProps {
  stores: StoreConfig[];
  isLoading: boolean;
  activeStoreId: string | null;
  onActivate: (id: string) => void;
  isActivating?: boolean;
}

function StoreActiveIndicator({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
      </span>
    );
  }
  return <span className="size-2.5 rounded-full bg-muted-foreground/30" />;
}

export function MonitorSidebar({
  stores,
  isLoading,
  activeStoreId,
  onActivate,
  isActivating = false,
}: MonitorSidebarProps) {
  const multiStore = stores.length > 1;

  return (
    <aside className="w-52 shrink-0 border-r overflow-y-auto">
      <div className="px-3 py-4">
        <p className="mb-2 px-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          数据存储
        </p>
        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : stores.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">暂无存储配置</p>
        ) : (
          <div className="space-y-0.5">
            {stores.map((store) => {
              const isSelected = activeStoreId === store.id;
              return multiStore ? (
                <button
                  key={store.id}
                  type="button"
                  disabled={isActivating || isSelected}
                  onClick={() => onActivate(store.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    isSelected
                      ? "bg-primary/10 text-primary font-medium cursor-default"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    isActivating && !isSelected && "opacity-50 pointer-events-none",
                  )}
                >
                  <StoreActiveIndicator isActive={store.is_active} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-xs leading-tight">{store.name}</p>
                    <p className="truncate text-[10px] opacity-70">{store.addr}</p>
                  </div>
                </button>
              ) : (
                <div
                  key={store.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                    isSelected ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )}
                >
                  <StoreActiveIndicator isActive={store.is_active} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-xs leading-tight">{store.name}</p>
                    <p className="truncate text-[10px] opacity-70">{store.addr}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
