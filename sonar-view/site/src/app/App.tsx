import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { SettingsPage } from "@/views/settings";
import { MonitorPage } from "@/views/monitor";
import { SnapshotListPage } from "@/views/snapshots";
import { SnapshotDetailPage } from "@/views/snapshots/detail";
import { TapListPage } from "@/views/taps";
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
            <Route path="monitor/:tapId" element={<MonitorPage />} />
            <Route path="snapshots" element={<SnapshotListPage />} />
            <Route path="snapshots/:id" element={<SnapshotDetailPage />} />
            <Route path="taps" element={<TapListPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="monitor" replace />} />
          </Route>
        </Routes>
      </Providers>
    </BrowserRouter>
  );
}
