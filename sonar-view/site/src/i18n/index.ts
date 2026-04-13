import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import commonEn from "./locales/en/common.json";
import dashboardEn from "./locales/en/dashboard.json";
import themeEn from "./locales/en/theme.json";
import commonZh from "./locales/zh-CN/common.json";
import dashboardZh from "./locales/zh-CN/dashboard.json";
import themeZh from "./locales/zh-CN/theme.json";

const resources = {
  "zh-CN": {
    common: commonZh,
    dashboard: dashboardZh,
    theme: themeZh,
  },
  en: {
    common: commonEn,
    dashboard: dashboardEn,
    theme: themeEn,
  },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: "zh-CN",
  fallbackLng: "zh-CN",
  ns: ["common", "dashboard", "theme"],
  defaultNS: "common",
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export { i18n };
export type { resources };
