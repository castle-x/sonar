import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

function SettingsPage() {
  const { t } = useTranslation("dashboard");

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("pages.settings.title")}</h1>
        <p className="text-muted-foreground">{t("pages.settings.description")}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col items-center justify-center gap-4 rounded-xl border bg-card p-12 shadow-sm"
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <HugeiconsIcon icon={Settings01Icon} className="size-6 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="font-medium">{t("pages.settings.comingSoon")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("pages.settings.comingSoonDescription")}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export { SettingsPage };
