import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import meta from "../../../app.json";

const ACCENT_COLORS = ["neutral", "emerald", "sapphire"] as const;

type AccentColor = (typeof ACCENT_COLORS)[number];

interface AccentColorConfig {
  name: AccentColor;
  activeColor: string;
  /** 4-color palette swatch for menu display: [primary, secondary, tertiary, neutral] */
  palette: [string, string, string, string];
}

interface ColorThemeState {
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
}

const ACCENT_COLOR_CONFIGS: AccentColorConfig[] = [
  {
    name: "neutral",
    activeColor: "oklch(0.205 0 0)",
    palette: ["oklch(0.205 0 0)", "oklch(0.556 0 0)", "oklch(0.708 0 0)", "oklch(0.922 0 0)"],
  },
  {
    name: "emerald",
    activeColor: "oklch(0.696 0.17 162.48)",
    palette: [
      "oklch(0.432 0.095 166.913)",
      "oklch(0.596 0.145 163.225)",
      "oklch(0.696 0.17 162.48)",
      "oklch(0.845 0.143 164.978)",
    ],
  },
  {
    name: "sapphire",
    activeColor: "oklch(0.546 0.245 262.881)",
    palette: [
      "oklch(0.424 0.199 265.638)",
      "oklch(0.546 0.245 262.881)",
      "oklch(0.623 0.214 259.815)",
      "oklch(0.809 0.105 251.813)",
    ],
  },
];

function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && ACCENT_COLORS.includes(value as AccentColor);
}

const useColorTheme = create<ColorThemeState>()(
  persist(
    (set) => ({
      accentColor: "neutral",
      setAccentColor: (color) => set({ accentColor: color }),
    }),
    {
      name: `${meta.name}-color-theme`,
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ColorThemeState> | undefined;

        return {
          ...currentState,
          accentColor: isAccentColor(persisted?.accentColor)
            ? persisted.accentColor
            : currentState.accentColor,
        };
      },
    },
  ),
);

/**
 * Sync color theme state to HTML data attributes.
 * Must be called once in a top-level component (e.g. ThemeProvider).
 */
function useColorThemeSync() {
  const { accentColor } = useColorTheme();

  useEffect(() => {
    const root = document.documentElement;

    if (accentColor === "neutral") {
      root.removeAttribute("data-accent");
    } else {
      root.setAttribute("data-accent", accentColor);
    }
  }, [accentColor]);
}

export { ACCENT_COLORS, ACCENT_COLOR_CONFIGS, useColorTheme, useColorThemeSync };
export type { AccentColor, AccentColorConfig };
