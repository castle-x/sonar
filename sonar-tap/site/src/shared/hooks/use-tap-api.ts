import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Unified fetch helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
}

export interface StatusResponse {
  watcher_count: number;
  watcher_stats: Record<string, unknown>;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  labels: Record<string, string>;
  log_path: string;
}

export interface MetricPoint {
  received_at: string;
  timestamp: number;
  name: string;
  value: number;
  labels?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/api/v1/health"),
    staleTime: 0,
    refetchInterval: 5000,
    meta: { onError: () => toast.error("Failed to fetch health status") },
  });
}

export function useProcesses() {
  return useQuery({
    queryKey: ["processes"],
    queryFn: () => apiFetch<ProcessInfo[]>("/api/v1/processes"),
    staleTime: 0,
    refetchInterval: 10000,
  });
}

export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => apiFetch<StatusResponse>("/api/v1/status"),
    staleTime: 0,
    refetchInterval: 10000,
  });
}

export function useMetricsPreview(limit = 200) {
  return useQuery({
    queryKey: ["metrics-preview", limit],
    queryFn: () => apiFetch<MetricPoint[]>(`/api/v1/metrics/preview?limit=${limit}`),
    staleTime: 0,
  });
}

// ---------------------------------------------------------------------------
// Config types (mirrors Go config structs)
// ---------------------------------------------------------------------------

export interface TapConfig {
  step: number;
  sonar_store: SonarStoreConfig;
  node_exporter: NodeExporterConfig;
  process_exporter: ProcessExporterConfig;
  log_config: LogConfigItem[];
}

export interface SonarStoreConfig {
  app_id: string;
  enabled: boolean;
  host: string;
  req_timeout: number;
  report_interval: number;
  buf_size: number;
  print_metrics: boolean;
  labels: Record<string, string>;
  channel_size: number;
}

export interface NodeExporterConfig {
  enabled: boolean;
  labels: Record<string, string>;
}

export interface ProcessExporterConfig {
  enabled: boolean;
  dynamic_interval: number;
  rules: ProcessRule[];
}

export interface ProcessRule {
  pid?: number;
  name: string;
  cmdlines: string[];
  log_path_pattern?: string;
  extracts: Extract[];
}

export interface Extract {
  type?: "default" | "split" | "regex";
  sep?: string;
  pattern?: string;
  labels: Record<string, string>;
}

export interface WatchConfig {
  poll_interval?: string;
  use_inotify?: boolean;
  rotate_check_interval?: string;
  max_retries?: number;
}

export interface LogConfigItem {
  name: string;
  file_path?: string;
  rules: ProcessRule[];
  dynamic_interval: number;
  encoding?: string;
  enabled: boolean;
  read_mode?: string;
  max_file_size_mb?: number;
  time_zone?: string;
  watch?: WatchConfig;
  metrics: MetricConfigItem[];
}

export interface MetricConfigItem {
  name: string;
  help?: string;
  pattern: string;
  enabled: boolean;
  density: number;
  timestamp?: string;
  timestamp_format?: string;
  time_zone?: string;
  value: string;
  labels?: Record<string, string>;
  is_record_minute_count: boolean;
}

export interface WatchConfig {
  poll_interval?: string;
  use_inotify?: boolean;
  rotate_check_interval?: string;
  max_retries?: number;
}

// ---------------------------------------------------------------------------
// Config hooks
// ---------------------------------------------------------------------------

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => apiFetch<TapConfig>("/api/v1/config"),
    staleTime: 0,
  });
}

export function usePatchNodeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NodeExporterConfig) => apiPatch<{ status: string }>("/api/v1/config/node", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["config"] }); toast.success("Node config saved"); },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });
}

export function usePatchProcessConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProcessExporterConfig) => apiPatch<{ status: string }>("/api/v1/config/process", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["config"] }); toast.success("Process config saved"); },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });
}

export function usePatchLogConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LogConfigItem[]) => apiPatch<{ status: string }>("/api/v1/config/log", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["config"] }); toast.success("Log config saved"); },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });
}

export function usePatchSonarStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { step: number; sonar_store: SonarStoreConfig }) =>
      fetch("/api/v1/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["config"] }); toast.success("Sonar Store config saved"); },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });
}

export function useReloadConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ status: string }>("/api/v1/config/reload", {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["config"] }); toast.success("Config reloaded from disk"); },
    onError: (e) => toast.error(`Reload failed: ${e.message}`),
  });
}

// ---------------------------------------------------------------------------
// Debug hooks
// ---------------------------------------------------------------------------

export interface RegexDebugReq {
  pattern: string;
  input: string;
}

export interface RegexDebugResp {
  matched: boolean;
  groups?: string[];
  named_groups?: Record<string, string>;
  error?: string;
}

export function useDebugRegex() {
  return useMutation({
    mutationFn: (data: RegexDebugReq) => apiPost<RegexDebugResp>("/api/v1/debug/regex", data),
  });
}
