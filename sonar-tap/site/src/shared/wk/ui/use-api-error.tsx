import { create } from "zustand";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ApiErrorDetail {
  method: string;
  status: number;
  statusText: string;
  url: string;
  requestPayload?: unknown;
  responseBody?: unknown;
  rawError: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════════════════════════

interface ApiErrorState {
  error: ApiErrorDetail | null;
  show: (error: ApiErrorDetail) => void;
  hide: () => void;
}

export const useApiErrorStore = create<ApiErrorState>((set) => ({
  error: null,
  show: (error) => set({ error }),
  hide: () => set({ error: null }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Helper function for non-React code
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Show API error dialog from non-React code (e.g., pb-client.ts)
 */
export function showApiErrorDialog(error: ApiErrorDetail): void {
  useApiErrorStore.getState().show(error);
}
