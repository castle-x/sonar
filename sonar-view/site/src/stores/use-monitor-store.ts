import { create } from "zustand";
import type { GranularityName } from "@/shared/types";

interface MonitorState {
  selectedTapId: string | null;
  granularity: GranularityName;
  legendVisible: boolean;
  gridCols: 1 | 2;
  setSelectedTapId: (id: string | null) => void;
  setGranularity: (g: GranularityName) => void;
  toggleLegend: () => void;
  toggleGridCols: () => void;
}

export const useMonitorStore = create<MonitorState>()((set) => ({
  selectedTapId: null,
  granularity: "1m",
  legendVisible: true,
  gridCols: 2,
  setSelectedTapId: (id) => set({ selectedTapId: id }),
  setGranularity: (g) => set({ granularity: g }),
  toggleLegend: () => set((s) => ({ legendVisible: !s.legendVisible })),
  toggleGridCols: () => set((s) => ({ gridCols: s.gridCols === 2 ? 1 : 2 })),
}));
