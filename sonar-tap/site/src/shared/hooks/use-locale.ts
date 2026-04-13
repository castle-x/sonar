import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { i18n } from "@/i18n";
import meta from "../../../app.json";

export const SUPPORTED_LOCALES = ["zh-CN", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocale = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "zh-CN",
      setLocale: (locale) => set({ locale }),
    }),
    { name: `${meta.name}-locale` },
  ),
);

/**
 * Sync locale state to i18next.
 * Must be called once in a top-level component (e.g. App or Providers).
 */
export function useLocaleSync() {
  const { locale } = useLocale();

  useEffect(() => {
    i18n.changeLanguage(locale);
  }, [locale]);
}
