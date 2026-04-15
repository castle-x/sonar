import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { MetricPoint, SnapshotDetail, SnapshotMeta, TapInstance } from "@/shared/types";
import type { StoreConfig } from "@/api/sonar-view/store-config/v1/types";

// ── Taps ──────────────────────────────────────────────────────────────────────

export function useTaps() {
  return useQuery({
    queryKey: queryKeys.taps.all(),
    queryFn: async () => {
      const resp = await api.get<{ list: TapInstance[]; total: number } | TapInstance[]>("/api/v1/taps");
      // Backend returns {list: [...], total: N}
      if (resp && !Array.isArray(resp) && 'list' in resp) {
        return resp.list ?? [];
      }
      return Array.isArray(resp) ? resp : [];
    },
    refetchInterval: 15_000,
    placeholderData: [],
  });
}

export function useTap(id: string) {
  return useQuery({
    queryKey: queryKeys.taps.detail(id),
    queryFn: () => api.get<TapInstance>(`/api/v1/taps/${id}`),
    enabled: Boolean(id),
  });
}

// ── Metrics ───────────────────────────────────────────────────────────────────

interface AggregatedMetricsParams {
  tapId: string;
  granularity: string;
  startTime?: number;
  endTime?: number;
  names?: string[];
}

export function useAggregatedMetrics(params: AggregatedMetricsParams, enabled = true) {
  const { tapId, granularity, startTime, endTime, names } = params;
  return useQuery({
    queryKey: queryKeys.metrics.aggregated(tapId, granularity),
    queryFn: async () => {
      const searchParams = new URLSearchParams({ tap_id: tapId, granularity });
      if (startTime) searchParams.set("start", String(startTime));
      if (endTime) searchParams.set("end", String(endTime));
      if (names?.length) searchParams.set("names", names.join(","));
      return api.get<MetricPoint[]>(`/api/v1/metrics?${searchParams.toString()}`);
    },
    enabled: enabled && Boolean(tapId),
    refetchInterval: 30_000,
    placeholderData: [],
  });
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

export function useSnapshots(filters?: { tapId?: string; status?: string }) {
  return useQuery({
    queryKey: queryKeys.snapshots.all(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.tapId) params.set("tap_id", filters.tapId);
      if (filters?.status) params.set("status", filters.status);
      const qs = params.toString();
      const resp = await api.get<{ list: SnapshotMeta[]; total: number } | SnapshotMeta[]>(
        `/api/v1/snapshots${qs ? `?${qs}` : ""}`
      );
      if (resp && !Array.isArray(resp) && 'list' in resp) return resp.list ?? [];
      return Array.isArray(resp) ? resp : [];
    },
    placeholderData: [],
  });
}

export function useSnapshot(id: string) {
  return useQuery({
    queryKey: queryKeys.snapshots.detail(id),
    queryFn: () => api.get<SnapshotDetail>(`/api/v1/snapshots/${id}`),
    enabled: Boolean(id),
  });
}

export function useSnapshotMetrics(snapshotId: string, caseId?: string) {
  return useQuery({
    queryKey: queryKeys.snapshots.metrics(snapshotId, caseId),
    queryFn: () => {
      const params = caseId ? `?case_id=${caseId}` : "";
      return api.get<MetricPoint[]>(`/api/v1/snapshots/${snapshotId}/metrics${params}`);
    },
    enabled: Boolean(snapshotId),
    staleTime: Number.POSITIVE_INFINITY, // snapshot data is immutable
  });
}

interface CreateSnapshotInput {
  name: string;
  tapId: string;
  startTime: number;
  endTime: number;
}

export function useCreateSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSnapshotInput) =>
      api.post<SnapshotMeta>("/api/v1/snapshots", {
        name: input.name,
        tap_id: input.tapId,
        start_time: input.startTime,
        end_time: input.endTime,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.snapshots.all() });
    },
  });
}

export function useDeleteSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/v1/snapshots/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.snapshots.all() });
    },
  });
}

// ── StoreConfigs ──────────────────────────────────────────────────────────────

interface StoreConfigListResponse {
  code: number;
  data: { list: StoreConfig[]; total: number };
}

export function useStoreConfigs() {
  return useQuery({
    queryKey: queryKeys.storeConfigs.all(),
    queryFn: async () => {
      const resp = await api.get<StoreConfigListResponse>("/api/v1/store-configs");
      return resp.data?.list ?? [];
    },
    placeholderData: [],
  });
}

export function useCreateStoreConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; addr: string; description?: string }) =>
      api.post("/api/v1/store-configs", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.storeConfigs.all() });
    },
  });
}

export function useActivateStoreConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/store-configs/${id}/activate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.storeConfigs.all() });
    },
  });
}

export function useDeleteStoreConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/store-configs/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.storeConfigs.all() });
    },
  });
}
