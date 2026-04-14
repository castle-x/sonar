import type { GranularityName } from "@/shared/types";

export interface GranularityLevel {
  name: GranularityName;
  label: string;
  windowLabel: string;
  queryWindowMs: number;
  maxPoints: number;
  refreshMode: "ws" | "poll";
  refreshIntervalMs: number;
}

export const GRANULARITY_CONFIG: Record<GranularityName, GranularityLevel> = {
  "15s": {
    name: "15s",
    label: "15秒",
    windowLabel: "近30分钟",
    queryWindowMs: 30 * 60 * 1000,
    maxPoints: 120,
    refreshMode: "ws",
    refreshIntervalMs: 15_000,
  },
  "1m": {
    name: "1m",
    label: "1分钟",
    windowLabel: "近2小时",
    queryWindowMs: 2 * 60 * 60 * 1000,
    maxPoints: 120,
    refreshMode: "ws",
    refreshIntervalMs: 60_000,
  },
  "5m": {
    name: "5m",
    label: "5分钟",
    windowLabel: "近10小时",
    queryWindowMs: 10 * 60 * 60 * 1000,
    maxPoints: 120,
    refreshMode: "poll",
    refreshIntervalMs: 5 * 60 * 1000,
  },
  "1h": {
    name: "1h",
    label: "1小时",
    windowLabel: "近7天",
    queryWindowMs: 7 * 24 * 60 * 60 * 1000,
    maxPoints: 168,
    refreshMode: "poll",
    refreshIntervalMs: 10 * 60 * 1000,
  },
  "6h": {
    name: "6h",
    label: "6小时",
    windowLabel: "近30天",
    queryWindowMs: 30 * 24 * 60 * 60 * 1000,
    maxPoints: 120,
    refreshMode: "poll",
    refreshIntervalMs: 30 * 60 * 1000,
  },
  "1d": {
    name: "1d",
    label: "1天",
    windowLabel: "近1年",
    queryWindowMs: 365 * 24 * 60 * 60 * 1000,
    maxPoints: 365,
    refreshMode: "poll",
    refreshIntervalMs: 60 * 60 * 1000,
  },
};

export const REALTIME_GRANULARITIES: GranularityName[] = ["15s", "1m"];
