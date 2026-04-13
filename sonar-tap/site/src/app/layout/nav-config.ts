import {
  DashboardBrowsingIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

// ---------------------------------------------------------------------------
// NavItem type system
// ---------------------------------------------------------------------------

/** Route link navigation item */
interface NavLinkItem {
  type: "link";
  key: string;
  icon: IconSvgElement;
  /** i18n key under "dashboard" namespace */
  titleKey: string;
  /** i18n key for page description */
  descKey?: string;
  /** Relative path segment, e.g. "home", "settings" */
  path: string;
}

/** Action button navigation item (click handler or external url) */
interface NavActionItem {
  type: "action";
  key: string;
  icon: IconSvgElement;
  /** i18n key under "dashboard" namespace */
  titleKey: string;
  /** Action identifier for click handling */
  action?: string;
}

type NavItem = NavLinkItem | NavActionItem;

/** A group/section rendered as a SidebarGroup */
interface NavSection {
  key: string;
  /** Optional i18n key for SidebarGroupLabel */
  label?: string;
  items: NavItem[];
  /** Extra className applied to SidebarGroup, e.g. "mt-auto" */
  className?: string;
}

// ---------------------------------------------------------------------------
// Navigation configuration
// ---------------------------------------------------------------------------

const navSections: NavSection[] = [
  {
    key: "main",
    items: [
      {
        type: "link",
        key: "dashboard",
        icon: DashboardBrowsingIcon,
        titleKey: "nav.dashboard",
        descKey: "pages.dashboard.description",
        path: "dashboard",
      },
      {
        type: "link",
        key: "settings",
        icon: Settings01Icon,
        titleKey: "nav.settings",
        descKey: "pages.settings.description",
        path: "settings",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Resolve the page title i18n key from nav-config based on current pathname.
 * Falls back to "nav.home" if no match is found.
 */
function getPageTitleKey(sections: NavSection[], pathname: string): string {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.type === "link") {
        const suffix = `/${item.path}`;
        if (pathname.endsWith(suffix) || pathname.includes(`${suffix}/`)) {
          return item.titleKey;
        }
      }
    }
  }
  return "nav.dashboard";
}

/**
 * Resolve the page description i18n key from nav-config based on current pathname.
 */
function getPageDescKey(sections: NavSection[], pathname: string): string | undefined {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.type === "link") {
        const suffix = `/${item.path}`;
        if (pathname.endsWith(suffix) || pathname.includes(`${suffix}/`)) {
          return item.descKey;
        }
      }
    }
  }
  return undefined;
}

export { getPageTitleKey, getPageDescKey, navSections };
export type { NavActionItem, NavItem, NavLinkItem, NavSection };
