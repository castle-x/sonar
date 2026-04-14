import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { MetricPoint, SnapshotDetail, SnapshotMeta, TapInstance } from "@/shared/types";

// ── Taps ──────────────────────────────────────────────────────────────────────

export function useTaps() {
  return useQuery({
    queryKey: queryKeys.taps.all(),
    queryFn: () => api.get<TapInstance[]>("/api/v1/taps"),
    refetchInterval: 15_000,
    // Return empty array on error so UI doesn't break
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
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.tapId) params.set("tap_id", filters.tapId);
      if (filters?.status) params.set("status", filters.status);
      const qs = params.toString();
      return api.get<SnapshotMeta[]>(`/api/v1/snapshots${qs ? `?${qs}` : ""}`);
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
