export const queryKeys = {
  taps: {
    all: () => ["taps"] as const,
    detail: (id: string) => ["taps", id] as const,
  },
  snapshots: {
    all: (filters?: object) => ["snapshots", filters] as const,
    detail: (id: string) => ["snapshots", id] as const,
    metrics: (id: string, caseId?: string) => ["snapshots", id, "metrics", caseId] as const,
    score: (id: string) => ["snapshots", id, "score"] as const,
  },
  metrics: {
    aggregated: (tapId: string, granularity: string) =>
      ["metrics", "aggregated", tapId, granularity] as const,
  },
  storeConfigs: {
    all: () => ["store-configs"] as const,
  },
};
