import { useMemo } from "react";

/**
 * Generate N distinct colors in HSL space.
 * Colors are spread evenly across the hue spectrum for maximum distinction.
 *
 * Example: useChartColors(3) → ["hsl(0, 45%, 60%)", "hsl(120, 45%, 60%)", "hsl(240, 45%, 60%)"]
 */
export function useChartColors(count: number): string[] {
  return useMemo(() => {
    if (count <= 0) return [];

    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      const hue = (i * 360) / count;
      const saturation = 45; // Fixed saturation
      const lightness = 60; // Fixed lightness
      colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
    return colors;
  }, [count]);
}

/**
 * Generate a deterministic color from a string key.
 * Same input always produces same color (useful for consistent series colors).
 */
export function getSeriesColorFromKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 45;
  const lightness = 60;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
