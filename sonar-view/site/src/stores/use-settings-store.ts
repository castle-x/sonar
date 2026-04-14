import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  viewServerUrl: string;
  setViewServerUrl: (url: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      viewServerUrl: "http://localhost:8283",
      setViewServerUrl: (url) => set({ viewServerUrl: url }),
    }),
    { name: "sonar-view-settings" },
  ),
);
