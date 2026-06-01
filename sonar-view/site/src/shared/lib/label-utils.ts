import type { AggregatedPoint } from "@/lib/points-compressed";

/**
 * Extract all unique label keys and their values from a set of data points.
 * Returns a record mapping label key → Set of values.
 *
 * Example:
 *   extractAvailableLabels([
 *     { labels: { instance: "192.168.1.1", job: "node" }, ... },
 *     { labels: { instance: "192.168.1.2", job: "node" }, ... },
 *   ])
 *   => { instance: Set(["192.168.1.1", "192.168.1.2"]), job: Set(["node"]) }
 */
export function extractAvailableLabels(
  points: AggregatedPoint[]
): Record<string, Set<string>> {
  const labelMap: Record<string, Set<string>> = {};

  for (const point of points) {
    for (const [key, value] of Object.entries(point.labels)) {
      if (!labelMap[key]) {
        labelMap[key] = new Set();
      }
      labelMap[key].add(value);
    }
  }

  return labelMap;
}

/**
 * Filter data points by selected label conditions.
 * selectedLabels: { "instance": ["192.168.1.1"], "job": ["node"] }
 * Returns only points that match ALL conditions (AND logic).
 */
export function filterPointsByLabels(
  points: AggregatedPoint[],
  selectedLabels: Record<string, string[]>
): AggregatedPoint[] {
  if (Object.keys(selectedLabels).length === 0) {
    return points;
  }

  return points.filter((point) => {
    for (const [key, values] of Object.entries(selectedLabels)) {
      if (!values.includes(point.labels[key])) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Generate a unique key for a time series based on metric name and labels.
 * Used for grouping and identifying series.
 *
 * Example: generateSeriesKey("cpu_usage", { instance: "192.168.1.1", job: "node" })
 *   => "cpu_usage{instance=192.168.1.1,job=node}"
 */
export function generateSeriesKey(
  metricName: string,
  labels: Record<string, string>
): string {
  const sortedLabels = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");

  return `${metricName}{${sortedLabels}}`;
}

/**
 * Group AggregatedPoint[] by time series (metric + labels).
 * Returns Map<seriesKey, AggregatedPoint[]>.
 */
export function groupByTimeSeries(
  points: AggregatedPoint[]
): Map<string, AggregatedPoint[]> {
  const grouped = new Map<string, AggregatedPoint[]>();

  for (const point of points) {
    const key = generateSeriesKey(point.metric, point.labels);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(point);
  }

  return grouped;
}

/**
 * Format a series label for display (truncate long labels).
 * Example: "cpu_usage{instance=192.168.1.1,job=node}" → "cpu_usage{instance=192.168.1...}"
 */
export function formatSeriesLabel(key: string, maxLength: number = 50): string {
  if (key.length <= maxLength) {
    return key;
  }
  return key.substring(0, maxLength - 3) + "...";
}

/**
 * Get distribution of label values for a specific label key.
 * Useful for UI suggestions and filtering.
 */
export function getLabelDistribution(
  points: AggregatedPoint[],
  labelKey: string
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const point of points) {
    const value = point.labels[labelKey];
    if (value) {
      distribution[value] = (distribution[value] ?? 0) + 1;
    }
  }

  return distribution;
}

/**
 * Get suggested label key ordering (by frequency/cardinality).
 * High-cardinality labels first (more useful for filtering).
 */
export function getSuggestedLabelOrder(
  points: AggregatedPoint[]
): string[] {
  const labelCardinality: Record<string, number> = {};

  for (const point of points) {
    for (const [key] of Object.entries(point.labels)) {
      labelCardinality[key] = (labelCardinality[key] ?? 0) + 1;
    }
  }

  return Object.entries(labelCardinality)
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => key);
}

/**
 * Check if a label matches a pattern (supports glob-like * wildcards).
 */
export function matchesLabelPattern(
  labelValue: string,
  pattern: string
): boolean {
  if (!pattern.includes("*")) {
    return labelValue === pattern;
  }

  const regex = new RegExp(
    `^${pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`
  );

  return regex.test(labelValue);
}
