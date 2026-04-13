import { DashboardBrowsingIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { Link } from "react-router";
import { Separator } from "@/shared/shadcn/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/shadcn/sidebar";
import { navSections } from "../nav-config";
import { Nav } from "./nav";
import { NavUser } from "./nav-user";

function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible="icon"
      // @modify: 覆盖 inset variant 的 p-2，去掉左/上/下边距，只保留右边距
      // icon 折叠模式下移除不对称 padding，使图标居中
      className="!p-0 !pr-2 group-data-[collapsible=icon]:!pr-0"
      {...props}
    >
      {/* @modify: Brand logo — "Dashboard" */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-9 gap-3 px-3"
            >
              <Link to="/">
                <HugeiconsIcon
                  icon={DashboardBrowsingIcon}
                  className="size-5!"
                />
                {/* @modify: 折叠态文本不可见但保留占位空间 */}
                <span className="font-[family-name:var(--font-headline)] text-base font-bold group-data-[collapsible=icon]:opacity-0">
                  Dashboard
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <Separator className="mx-auto w-[calc(100%-theme(spacing.4))] opacity-50 group-data-[collapsible=icon]:opacity-0" />

      <SidebarContent>
        {navSections.map((section) => (
          <Nav
            key={section.key}
            section={section}
          />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

export { AppSidebar };
