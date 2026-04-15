import {
  Camera01Icon,
  ComputerIcon,
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
        key: "monitor",
        icon: ComputerIcon,
        titleKey: "nav.monitor",
        path: "monitor",
      },
      {
        type: "link",
        key: "snapshots",
        icon: Camera01Icon,
        titleKey: "nav.snapshots",
        path: "snapshots",
      },
    ],
  },
  {
    key: "bottom",
    className: "mt-auto",
    items: [
      {
        type: "link",
        key: "settings",
        icon: Settings01Icon,
        titleKey: "nav.settings",
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
  return "nav.monitor";
}

export { getPageTitleKey, navSections };
export type { NavActionItem, NavItem, NavLinkItem, NavSection };
