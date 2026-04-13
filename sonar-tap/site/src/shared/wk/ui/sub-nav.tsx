import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation } from "react-router";
import { cn } from "@/shared/lib/utils";

export interface SubNavItem {
  label: string;
  path: string;
  icon?: IconSvgElement;
  badge?: string;
}

export interface SubNavGroup {
  label: string;
  items: SubNavItem[];
}

export interface SubNavProps {
  groups: SubNavGroup[];
  title?: string;
  basePath?: string;
  className?: string;
}

export function SubNav({ groups, title, basePath, className }: SubNavProps) {
  const { pathname } = useLocation();

  function resolveHref(itemPath: string): string {
    if (basePath) {
      return `${basePath}/${itemPath}`;
    }
    return itemPath;
  }

  function isActive(itemPath: string): boolean {
    const fullPath = resolveHref(itemPath);
    return pathname === fullPath || pathname.startsWith(`${fullPath}/`);
  }

  return (
    <nav className={cn("flex w-56 shrink-0 flex-col border-r bg-background", className)}>
      {title && (
        <div className="px-4 pt-6 pb-2">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
      )}

      <div className="flex flex-col gap-6 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(item.path);
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <Link
                      to={resolveHref(item.path)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      )}
                    >
                      {Icon && (
                        <HugeiconsIcon
                          icon={Icon}
                          className={cn(
                            "size-4 shrink-0",
                            active ? "text-foreground" : "text-muted-foreground",
                          )}
                        />
                      )}
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
