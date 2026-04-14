import { useCallback, useEffect, useRef, useState } from "react";
import { sonarWSClient } from "@/lib/websocket-client";
import { api } from "@/lib/api-client";
import { GRANULARITY_CONFIG } from "@/lib/granularity-config";
import type { GranularityName, MetricPoint, WSConnectionStatus, WSMessage } from "@/shared/types";

interface UseMonitorStreamOptions {
  tapId: string | null;
  granularity: GranularityName;
  enabled?: boolean;
}

interface UseMonitorStreamResult {
  /** Map from metric name → sorted time-series data points */
  data: Map<string, MetricPoint[]>;
  status: WSConnectionStatus;
  lastUpdateAt: number | null;
  /** Fetch historical data from aggregation API */
  fetchHistory: (startTime: number, endTime: number) => Promise<void>;
}

/** Aggregation event from backend (points topic) */
interface AggregationEventData {
  Level: string;
  Timestamp: string;
  Points: AggregatedPointWS[];
  Count: number;
}

/** Single aggregated point from WS */
interface AggregatedPointWS {
  datasource_id: string;
  name: string;
  labels: Record<string, string>;
  level: string;
  timestamp: number; // ms
  date: string;
  aggregation_type: string;
  value: number;
  quality: { score: number; status: string };
}

/** API response shape */
interface AggregationAPIResponse {
  code: number;
  data: {
    metrics: Array<{
      name: string;
      labels: Record<string, string>;
      points: Array<{ timestamp: number; value: number }>;
    }>;
    level: string;
    start_time: number;
    end_time: number;
  };
}

/**
 * Convert backend AggregatedPoint[] to frontend MetricPoint[].
 * We only keep "avg" aggregation type for display, to avoid duplicates.
 */
function toMetricPoints(points: AggregatedPointWS[]): MetricPoint[] {
  const result: MetricPoint[] = [];
  for (const p of points) {
    // Only use avg type for chart display to avoid showing duplicates
    if (p.aggregation_type && p.aggregation_type !== "avg") continue;
    result.push({
      name: p.name,
      value: p.value,
      timestamp: p.timestamp / 1000, // ms → seconds
      labels: p.labels ?? {},
    });
  }
  return result;
}

export function useMonitorStream({
  tapId,
  granularity,
  enabled = true,
}: UseMonitorStreamOptions): UseMonitorStreamResult {
  const [data, setData] = useState<Map<string, MetricPoint[]>>(new Map());
  const [status, setStatus] = useState<WSConnectionStatus>("disconnected");
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear data when tap changes
  useEffect(() => {
    setData(new Map());
    setLastUpdateAt(null);
  }, [tapId]);

  const mergePoints = useCallback(
    (incoming: MetricPoint[]) => {
      if (!incoming.length) return;
      const config = GRANULARITY_CONFIG[granularity];
      const cutoffSec = Date.now() / 1000 - config.queryWindowMs / 1000;

      setLastUpdateAt(Date.now());
      setData((prev) => {
        const next = new Map(prev);
        for (const point of incoming) {
          const existing = next.get(point.name) ?? [];
          // Merge, deduplicate by timestamp, sort, trim
          const merged = [...existing, point];
          const deduped = new Map<number, MetricPoint>();
          for (const p of merged) {
            if (p.timestamp > cutoffSec) {
              deduped.set(p.timestamp, p);
            }
          }
          const sorted = Array.from(deduped.values()).sort(
            (a, b) => a.timestamp - b.timestamp,
          );
          next.set(point.name, sorted.slice(-config.maxPoints));
        }
        return next;
      });
    },
    [granularity],
  );

  // Fetch history from aggregation API
  const fetchHistory = useCallback(
    async (startTime: number, endTime: number) => {
      try {
        const params = new URLSearchParams({
          start_time: startTime.toString(),
          end_time: endTime.toString(),
          level: granularity,
        });
        const resp = await api.get<AggregationAPIResponse>(
          `/api/v1/aggregation/metrics?${params.toString()}`,
        );
        const metrics = resp.data?.metrics ?? [];
        const points: MetricPoint[] = [];
        for (const m of metrics) {
          // Only include avg aggregation type for chart display
          if (m.labels?.aggregation_type && m.labels.aggregation_type !== "avg") continue;
          for (const pt of m.points) {
            points.push({
              name: m.name,
              value: pt.value,
              timestamp: pt.timestamp / 1000, // ms → seconds
              labels: m.labels ?? {},
            });
          }
        }
        mergePoints(points);
      } catch (err) {
        console.error("[monitor-stream] fetch history failed:", err);
      }
    },
    [granularity, mergePoints],
  );

  useEffect(() => {
    if (!enabled || !tapId) return;

    const config = GRANULARITY_CONFIG[granularity];

    // Always connect WS
    sonarWSClient.connect();
    const unsubStatus = sonarWSClient.onStatusChange(setStatus);
    setStatus(sonarWSClient.getStatus());

    // Subscribe to "points" topic for real-time aggregation data
    sonarWSClient.send({
      action: "subscribe",
      topic: "points",
      params: { tapIds: [tapId], granularity },
    });

    // Also subscribe to metric_stream for backward compatibility
    sonarWSClient.send({
      action: "subscribe",
      topic: "metric_stream",
      params: { tapIds: [tapId], granularity },
    });

    // Listen for aggregation broadcasts on "points" topic
    const unsubPoints = sonarWSClient.on<AggregationEventData>(
      "points",
      (msg: WSMessage<AggregationEventData>) => {
        if (!msg.data?.Points) return;
        const metricPoints = toMetricPoints(msg.data.Points);
        mergePoints(metricPoints);
      },
    );

    // Also listen on metric_stream for backward compatibility
    const unsubStream = sonarWSClient.on<MetricPoint[]>(
      `metric_stream:${tapId}`,
      (msg: WSMessage<MetricPoint[]>) => {
        if (msg.data?.length) {
          mergePoints(msg.data);
        }
      },
    );

    // Load initial history
    const now = Date.now();
    void fetchHistory(now - config.queryWindowMs, now);

    // For poll-mode granularities, set up periodic fetch
    if (config.refreshMode === "poll") {
      pollTimerRef.current = setInterval(() => {
        const end = Date.now();
        const start = end - config.refreshIntervalMs * 2; // overlap to avoid gaps
        void fetchHistory(start, end);
      }, config.refreshIntervalMs);
    }

    return () => {
      sonarWSClient.send({
        action: "unsubscribe",
        topic: "points",
        params: { tapIds: [tapId] },
      });
      sonarWSClient.send({
        action: "unsubscribe",
        topic: "metric_stream",
        params: { tapIds: [tapId] },
      });
      unsubStatus();
      unsubPoints();
      unsubStream();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [tapId, granularity, enabled, mergePoints, fetchHistory]);

  return { data, status, lastUpdateAt, fetchHistory };
}
