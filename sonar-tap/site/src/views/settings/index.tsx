import { Outlet, Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  CloudUploadIcon,
  ServerStack01Icon,
  CpuIcon,
  FileCodeIcon,
  Bug01Icon,
} from "@hugeicons/core-free-icons";
import { SubNav } from "@/shared/wk/ui/sub-nav";

function SettingsLayout() {
  const { t } = useTranslation("dashboard");

  const groups = [
    {
      label: t("pages.settings.groups.collector"),
      items: [
        { label: t("pages.settings.nav.sonarStore"), path: "sonar-store", icon: CloudUploadIcon },
        { label: t("pages.settings.nav.node"), path: "node", icon: ServerStack01Icon },
        { label: t("pages.settings.nav.process"), path: "process", icon: CpuIcon },
        { label: t("pages.settings.nav.log"), path: "log", icon: FileCodeIcon },
      ],
    },
    {
      label: t("pages.settings.groups.tools"),
      items: [
        { label: t("pages.settings.nav.debug"), path: "debug", icon: Bug01Icon },
      ],
    },
  ];

  return (
    <div className="flex flex-1 overflow-hidden">
      <SubNav groups={groups} basePath="/settings" className="shrink-0" />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

export { SettingsLayout };

export function SettingsPage() {
  return <Navigate to="/settings/sonar-store" replace />;
}
