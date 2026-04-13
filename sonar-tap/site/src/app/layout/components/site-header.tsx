import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { RotateClockwiseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useReloadConfig } from "@/shared/hooks/use-tap-api";
import { Button } from "@/shared/shadcn/button";
import { getPageTitleKey, getPageDescKey, navSections } from "../nav-config";

function SiteHeader() {
  const { t } = useTranslation("dashboard");
  const location = useLocation();
  const titleKey = getPageTitleKey(navSections, location.pathname);
  const descKey = getPageDescKey(navSections, location.pathname);
  const isSettings = location.pathname.startsWith("/settings");
  const reloadMutation = useReloadConfig();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <h1 className="font-[family-name:var(--font-headline)] text-base font-bold tracking-tight">
          {t(titleKey as never)}
        </h1>
        {descKey && (
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {t(descKey as never)}
          </span>
        )}
        {isSettings && (
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => reloadMutation.mutate()}
              disabled={reloadMutation.isPending}
            >
              <HugeiconsIcon
                icon={RotateClockwiseIcon}
                size={14}
                className={reloadMutation.isPending ? "animate-spin" : ""}
              />
              <span className="ml-1.5">{t("pages.config.reload")}</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

export { SiteHeader };
