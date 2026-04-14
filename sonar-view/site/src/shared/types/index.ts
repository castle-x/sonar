// Core types for sonar-view frontend

export type GranularityName = "15s" | "1m" | "5m" | "1h" | "6h" | "1d";

// ── Tap ──────────────────────────────────────────────────────────────────────

export interface TapInstance {
  id: string;
  appId: string;
  instance: string; // IP:port
  state: 1 | 2 | 3; // 1=UP, 2=DOWN, 3=UNKNOWN
  lastScrape: number; // Unix timestamp (seconds)
  name?: string;
  storeId?: string;
  tags?: Record<string, string>;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: number; // Unix timestamp (seconds)
  labels: Record<string, string>;
}

export interface AggregatedPoint {
  name: string;
  timestamp: number;
  value: number;
  aggregationType: "avg" | "min" | "max" | "count" | "last";
  labels: Record<string, string>;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface MetricScore {
  metricName: string;
  weight: number;
  rawValue: number;
  metricScore: number;
  weightedScore: number;
}

export interface SnapshotScore {
  total: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  metrics: MetricScore[];
}

export interface SnapshotMeta {
  id: string;
  name: string;
  tapId: string;
  appId: string;
  startTime: number; // Unix timestamp (seconds)
  endTime: number;
  durationSec: number;
  status: "creating" | "ready" | "failed";
  score?: SnapshotScore;
  caseCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SnapshotCase {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  score?: number;
  description?: string;
}

export interface SnapshotDetail extends SnapshotMeta {
  description?: string;
  cases: SnapshotCase[];
  extraInfo?: Record<string, string>;
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

export type WSConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface WSMessage<T = unknown> {
  type: "points" | "tap_status" | "snapshot_status" | "heartbeat";
  topic: string;
  data: T;
  timestamp: number;
}

export interface WSSubscribeMessage {
  action: "subscribe" | "unsubscribe";
  topic: "tap_status" | "store_status" | "metric_stream";
  params: {
    tapIds?: string[];
    metricNames?: string[];
    granularity?: GranularityName;
  };
}
