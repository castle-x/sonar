import { Outlet } from "react-router";
import { SidebarInset, SidebarProvider } from "@/shared/shadcn/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import { SiteHeader } from "./components/site-header";

function DashboardLayout() {
  return (
    <SidebarProvider className="h-svh !min-h-0">
      <AppSidebar variant="inset" />
      {/* @modify: 覆盖 shadcn 默认的 m-2/rounded-xl 为统一尺寸，不随主题切换变化 */}
      <SidebarInset className="min-h-0 overflow-auto transition-all duration-300 md:peer-data-[variant=inset]:rounded-[2rem] md:peer-data-[variant=inset]:my-3 md:peer-data-[variant=inset]:mr-3">
        <SiteHeader />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export { DashboardLayout };
