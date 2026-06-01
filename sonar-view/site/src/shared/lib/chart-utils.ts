/**
 * Format a timestamp (milliseconds) as HH:MM:SS
 */
export function formatShortTime(tsMs: number): string {
  const d = new Date(tsMs);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * Format a timestamp as YYYY-MM-DD HH:MM:SS
 */
export function formatShortDateTime(tsMs: number): string {
  const d = new Date(tsMs);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const time = formatShortTime(tsMs);
  return `${year}-${month}-${day} ${time}`;
}

/**
 * Format a timestamp as full readable string
 */
export function formatFullDateTime(tsMs: number): string {
  return new Date(tsMs).toLocaleString();
}

/**
 * Format a numeric value with appropriate units (K, M, G, etc.)
 * Examples: 1000 → "1.0K", 1500000 → "1.5M"
 */
export function formatValue(value: number): string {
  if (value === 0) return "0";

  const absValue = Math.abs(value);

  if (absValue >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}G`;
  }
  if (absValue >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (absValue >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return value.toFixed(1);
}

/**
 * Format bytes with appropriate units (B, KB, MB, GB)
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const absBytes = Math.abs(bytes);
  const unitIndex = Math.floor(Math.log(absBytes) / Math.log(1024));

  const value = bytes / Math.pow(1024, unitIndex);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format percentage value
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Smart number formatting that chooses appropriate precision
 */
export function formatSmartNumber(value: number): string {
  if (Math.abs(value) >= 1000) {
    return formatValue(value);
  }

  if (Math.abs(value) < 0.01) {
    return value.toExponential(2);
  }

  const decimals = value < 10 ? 2 : value < 100 ? 1 : 0;
  return value.toFixed(decimals);
}

/**
 * Calculate appropriate tick positions for X-axis time range
 */
export function calculateTimeTicks(
  startMs: number,
  endMs: number,
  maxTicks: number = 6
): number[] {
  const duration = endMs - startMs;
  const tickInterval = Math.ceil(duration / maxTicks);

  const ticks: number[] = [];
  for (let t = startMs; t <= endMs; t += tickInterval) {
    ticks.push(t);
  }

  // Always include end time
  if (ticks[ticks.length - 1] !== endMs) {
    ticks.push(endMs);
  }

  return ticks;
}

/**
 * Filter data points by time range
 */
export function filterDataByTime(
  points: Array<{ time: number; [key: string]: any }>,
  startMs: number,
  endMs: number
): Array<{ time: number; [key: string]: any }> {
  return points.filter((p) => p.time >= startMs && p.time <= endMs);
}

/**
 * Downsample data to maximum N points (for performance)
 */
export function downsampleData<T extends { time: number }>(
  points: T[],
  maxPoints: number
): T[] {
  if (points.length <= maxPoints) {
    return points;
  }

  const step = Math.ceil(points.length / maxPoints);
  const downsampled: T[] = [];

  for (let i = 0; i < points.length; i += step) {
    downsampled.push(points[i]);
  }

  // Always include last point
  if (downsampled[downsampled.length - 1] !== points[points.length - 1]) {
    downsampled.push(points[points.length - 1]);
  }

  return downsampled;
}

/**
 * Fill missing time points with interpolated or default values
 */
export function fillMissingTimePoints<T extends { time: number; value: number }>(
  points: T[],
  interval: number,
  fillValue: number = 0
): T[] {
  if (points.length === 0) return [];

  const filled: T[] = [];
  const startTime = points[0].time;
  const endTime = points[points.length - 1].time;

  let pointIndex = 0;

  for (let t = startTime; t <= endTime; t += interval) {
    if (pointIndex < points.length && Math.abs(points[pointIndex].time - t) < interval / 2) {
      filled.push(points[pointIndex]);
      pointIndex++;
    } else {
      filled.push({ time: t, value: fillValue } as T);
    }
  }

  return filled;
}

/**
 * Apply a transformation formula to values (safe evaluation)
 * Supports basic math: x + 5, x * 2, x / 100, etc.
 */
export function applyTransform(value: number, formula: string): number {
  try {
    // Replace 'x' with the actual value, then evaluate safely
    const expr = formula.replace(/x/g, `(${value})`);
    // Only allow basic math operations
    if (!/^[0-9+\-*/(). ]+$/.test(expr)) {
      return value; // Invalid formula, return original
    }
    return Function(`"use strict"; return (${expr})`)();
  } catch {
    return value; // Formula error, return original
  }
}
