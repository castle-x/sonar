import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { HomePage } from "@/views/home";
import { SettingsPage } from "@/views/settings";
import { DashboardLayout } from "./layout";
import { Providers } from "./providers";

export function App() {
  return (
    <BrowserRouter>
      <Providers>
        <Routes>
          <Route
            path="/"
            element={<DashboardLayout />}
          >
            <Route
              index
              element={
                <Navigate
                  to="home"
                  replace
                />
              }
            />
            <Route
              path="home"
              element={<HomePage />}
            />
            <Route
              path="settings"
              element={<SettingsPage />}
            />
            <Route
              path="*"
              element={
                <Navigate
                  to="/"
                  replace
                />
              }
            />
          </Route>
        </Routes>
      </Providers>
    </BrowserRouter>
  );
}
