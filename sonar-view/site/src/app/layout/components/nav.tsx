import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";
import { cn } from "@/shared/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/shadcn/sidebar";
import type { NavItem, NavSection } from "../nav-config";

// Extract the t function type from useTranslation("dashboard")
type DashboardT = ReturnType<typeof useTranslation<"dashboard">>["t"];

interface NavProps {
  section: NavSection;
}

// Helper to call t() with dynamic keys from nav-config
function tr(t: DashboardT, key: string): string {
  // nav-config keys are dynamic strings, safe to cast
  return String(t(key as never));
}

/**
 * Nav renders a single navigation section from nav-config.
 * Supports two item types: link, action.
 */
function Nav({ section }: NavProps) {
  const { t } = useTranslation("dashboard");
  const location = useLocation();

  return (
    <SidebarGroup className={section.className}>
      {section.label && <SidebarGroupLabel>{tr(t, section.label)}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {section.items.map((item) => (
            <NavItemRenderer
              key={item.key}
              item={item}
              pathname={location.pathname}
              t={t}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ---------------------------------------------------------------------------
// NavItem renderer — dispatches by item.type
// ---------------------------------------------------------------------------

interface NavItemRendererProps {
  item: NavItem;
  pathname: string;
  t: DashboardT;
}

function NavItemRenderer({ item, pathname, t }: NavItemRendererProps) {
  switch (item.type) {
    case "link": {
      const fullUrl = `/${item.path}`;
      const isActive = pathname === fullUrl || pathname.startsWith(`${fullUrl}/`);
      return (
        <SidebarMenuItem>
          {/* @modify: motion whileHover={{ x: 4 }} 实现平滑弹簧动画 */}
          <motion.div
            whileHover={isActive ? undefined : { x: 4 }}
            transition={{
              type: "spring",
              duration: 0.7,
              bounce: 0.1,
            }}
          >
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={tr(t, item.titleKey)}
              className={cn(
                "h-9 gap-3 px-3 font-[family-name:var(--font-headline)] text-xs font-bold! uppercase tracking-widest transition-colors duration-300",
                isActive
                  ? "bg-primary/15 text-primary rounded-lg border-l-4 border-primary hover:bg-primary/15 hover:text-primary group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:hover:bg-sidebar-accent/70"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Link to={fullUrl}>
                <HugeiconsIcon icon={item.icon} />
                {/* @modify: 折叠态文本不可见但保留占位空间 */}
                <span className="group-data-[collapsible=icon]:opacity-0">
                  {tr(t, item.titleKey)}
                </span>
              </Link>
            </SidebarMenuButton>
          </motion.div>
        </SidebarMenuItem>
      );
    }

    case "action": {
      return (
        <SidebarMenuItem>
          <motion.div whileHover={{ x: 4 }}>
            <SidebarMenuButton
              tooltip={tr(t, item.titleKey)}
              className="h-9 gap-3 px-3 font-[family-name:var(--font-headline)] text-xs font-bold! uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              <HugeiconsIcon icon={item.icon} />
              <span className="group-data-[collapsible=icon]:opacity-0">
                {tr(t, item.titleKey)}
              </span>
            </SidebarMenuButton>
          </motion.div>
        </SidebarMenuItem>
      );
    }
  }
}

export { Nav };
