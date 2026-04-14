import { useEffect, useRef, useState } from "react";
import { sonarWSClient } from "@/lib/websocket-client";
import type { GranularityName, MetricPoint, WSConnectionStatus, WSMessage } from "@/shared/types";
import { GRANULARITY_CONFIG } from "@/lib/granularity-config";

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
}

export function useMonitorStream({
  tapId,
  granularity,
  enabled = true,
}: UseMonitorStreamOptions): UseMonitorStreamResult {
  const [data, setData] = useState<Map<string, MetricPoint[]>>(new Map());
  const [status, setStatus] = useState<WSConnectionStatus>("disconnected");
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const topicRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !tapId) return;

    // Connect WS if not already
    sonarWSClient.connect();

    const unsubStatus = sonarWSClient.onStatusChange(setStatus);
    setStatus(sonarWSClient.getStatus());

    const topic = `metric_stream:${tapId}`;
    topicRef.current = topic;

    const unsubData = sonarWSClient.on<MetricPoint[]>(
      topic,
      (msg: WSMessage<MetricPoint[]>) => {
        const points = msg.data;
        if (!points?.length) return;

        setLastUpdateAt(Date.now());
        setData((prev) => {
          const next = new Map(prev);
          const config = GRANULARITY_CONFIG[granularity];
          const cutoffSec = Date.now() / 1000 - config.queryWindowMs / 1000;

          for (const point of points) {
            const existing = next.get(point.name) ?? [];
            const filtered = [
              ...existing.filter((p) => p.timestamp > cutoffSec),
              point,
            ].slice(-config.maxPoints);
            next.set(point.name, filtered);
          }
          return next;
        });
      },
    );

    // Subscribe
    sonarWSClient.send({
      action: "subscribe",
      topic: "metric_stream",
      params: { tapIds: [tapId], granularity },
    });

    return () => {
      sonarWSClient.send({
        action: "unsubscribe",
        topic: "metric_stream",
        params: { tapIds: [tapId] },
      });
      unsubStatus();
      unsubData();
    };
  }, [tapId, granularity, enabled]);

  return { data, status, lastUpdateAt };
}
