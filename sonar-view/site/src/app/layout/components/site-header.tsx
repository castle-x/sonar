import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { toast } from "sonner";
import { Button } from "@/shared/shadcn/button";
import { getPageTitleKey, navSections } from "../nav-config";

function SiteHeader() {
  const { t } = useTranslation("dashboard");
  const { t: tCommon } = useTranslation("common");
  const location = useLocation();
  const titleKey = getPageTitleKey(navSections, location.pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <h1 className="font-[family-name:var(--font-headline)] text-base font-bold tracking-tight">
          {t(titleKey as never)}
        </h1>
        {/* Search placeholder button */}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-2 px-2 text-muted-foreground"
            onClick={() => toast.info(tCommon("search.comingSoon"))}
          >
            <HugeiconsIcon
              icon={Search01Icon}
              className="size-3.5"
            />
            <span className="text-xs">{tCommon("search.label")}</span>
            <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground">
              ⌘K
            </kbd>
          </Button>
        </div>
      </div>
    </header>
  );
}

export { SiteHeader };
