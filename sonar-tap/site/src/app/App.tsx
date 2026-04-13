import { createBrowserRouter, Navigate, RouterProvider, Route, createRoutesFromElements } from "react-router";
import { DashboardPage } from "@/views/dashboard";
import { SettingsLayout } from "@/views/settings";
import { SonarStoreForm } from "@/views/settings/sonar-store-form";
import { NodePage } from "@/views/settings/node-form";
import { ProcessPage } from "@/views/settings/process-form";
import { LogPage } from "@/views/settings/log-form";
import { DebugPage } from "@/views/debug";
import { DashboardLayout } from "./layout";
import { Providers } from "./providers";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<DashboardLayout />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="settings" element={<SettingsLayout />}>
        <Route index element={<Navigate to="sonar-store" replace />} />
        <Route path="sonar-store" element={<SonarStoreForm />} />
        <Route path="node" element={<NodePage />} />
        <Route path="process" element={<ProcessPage />} />
        <Route path="log" element={<LogPage />} />
        <Route path="debug" element={<DebugPage />} />
      </Route>
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Route>
  )
);

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
