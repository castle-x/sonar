import {
  ColorsIcon,
  ComputerIcon,
  Moon01Icon,
  MoreVerticalIcon,
  Sun01Icon,
  TranslateIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import type { Locale } from "@/shared/hooks/use-locale";
import { SUPPORTED_LOCALES, useLocale } from "@/shared/hooks/use-locale";
import { ACCENT_COLOR_CONFIGS, useColorTheme } from "@/shared/hooks/use-theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/shadcn/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/shared/shadcn/sidebar";

const LOCALE_LABELS: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

const THEME_ICONS: Record<string, IconSvgElement> = {
  light: Sun01Icon,
  dark: Moon01Icon,
  system: ComputerIcon,
};

function NavUser() {
  const { t: tDashboard } = useTranslation("dashboard");
  const { t: tTheme } = useTranslation("theme");
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const { accentColor, setAccentColor } = useColorTheme();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="pl-2.5 pr-3 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
                S
              </span>
              <span className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:opacity-0">
                <span className="truncate text-sm font-medium">Sonar Tap</span>
                <span className="truncate text-xs text-muted-foreground">
                  {tDashboard("system.description")}
                </span>
              </span>
              <HugeiconsIcon
                icon={MoreVerticalIcon}
                className="ml-auto size-4 group-data-[collapsible=icon]:opacity-0"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 max-w-[13rem] rounded-lg"
            side={isMobile ? "bottom" : "top"}
            align="start"
            alignOffset={4}
            sideOffset={4}
          >
            {/* System Info */}
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                  S
                </span>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Sonar Tap</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {tDashboard("system.version")}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Language */}
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon icon={TranslateIcon} />
                  {tTheme("dropdown.language")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={locale}
                    onValueChange={(value) => setLocale(value as Locale)}
                  >
                    {SUPPORTED_LOCALES.map((loc) => (
                      <DropdownMenuRadioItem
                        key={loc}
                        value={loc}
                      >
                        {LOCALE_LABELS[loc]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />

            {/* Appearance: Theme / Accent Color */}
            <DropdownMenuGroup>
              {/* Theme Mode */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon icon={Sun01Icon} />
                  {tTheme("dropdown.theme")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={theme ?? "system"}
                    onValueChange={setTheme}
                  >
                    {(["light", "dark", "system"] as const).map((mode) => {
                      const icon = THEME_ICONS[mode];
                      return (
                        <DropdownMenuRadioItem
                          key={mode}
                          value={mode}
                        >
                          <HugeiconsIcon
                            icon={icon}
                            className="mr-1.5 size-4"
                          />
                          {tTheme(`mode.${mode}`)}
                        </DropdownMenuRadioItem>
                      );
                    })}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Accent Color */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon icon={ColorsIcon} />
                  {tTheme("accent.label")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={accentColor}
                    onValueChange={(value) =>
                      setAccentColor(value as (typeof ACCENT_COLOR_CONFIGS)[number]["name"])
                    }
                  >
                    {ACCENT_COLOR_CONFIGS.map((config) => (
                      <DropdownMenuRadioItem
                        key={config.name}
                        value={config.name}
                      >
                        {tTheme(`accent.${config.name}`)}
                        <span className="ml-auto flex h-3 w-8 shrink-0 overflow-hidden rounded-sm">
                          {config.palette.map((color) => (
                            <span
                              key={color}
                              className="h-full flex-1"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export { NavUser };
