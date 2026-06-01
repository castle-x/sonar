import { useMemo } from "react";

/**
 * Calculate optimal Y-axis width based on maximum value and optional unit.
 * Prevents label truncation and maintains consistent layout.
 *
 * Example:
 *   useYAxisWidth(12345, "ms") → 60 (pixels)
 *   useYAxisWidth(0.0001, "sec") → 50 (pixels)
 */
export function useYAxisWidth(maxValue: number, unit?: string): number {
  return useMemo(() => {
    // Base: character width in pixels (~8px for monospace)
    const charWidth = 8;

    // Calculate digits needed for max value
    const valueStr = Math.abs(maxValue).toFixed(1);
    const valueWidth = valueStr.length * charWidth;

    // Add space for unit (if provided)
    const unitWidth = unit ? (unit.length + 1) * charWidth : 0;

    // Add padding for safety (min 40px, max 80px)
    const total = valueWidth + unitWidth + 8; // 8px padding
    return Math.max(40, Math.min(total, 80));
  }, [maxValue, unit]);
}
