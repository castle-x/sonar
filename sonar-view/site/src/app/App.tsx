import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { SettingsPage } from "@/views/settings";
import { MonitorPage } from "@/views/monitor";
import { SnapshotListPage } from "@/views/snapshots";
import { SnapshotDetailPage } from "@/views/snapshots/detail";
import { DashboardLayout } from "./layout";
import { Providers } from "./providers";

export function App() {
  return (
    <BrowserRouter>
      <Providers>
        <Routes>
          <Route path="/" element={<DashboardLayout />}>
            <Route index element={<Navigate to="monitor" replace />} />
            <Route path="monitor" element={<MonitorPage />} />
            <Route path="snapshots" element={<SnapshotListPage />} />
            <Route path="snapshots/:id" element={<SnapshotDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="monitor" replace />} />
          </Route>
        </Routes>
      </Providers>
    </BrowserRouter>
  );
}
