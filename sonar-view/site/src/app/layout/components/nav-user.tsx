import {
  ColorsIcon,
  ComputerIcon,
  Moon01Icon,
  MoreVerticalIcon,
  Sun01Icon,
  TranslateIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import type { Locale } from "@/shared/hooks/use-locale";
import { SUPPORTED_LOCALES, useLocale } from "@/shared/hooks/use-locale";
import { ACCENT_COLOR_CONFIGS, useColorTheme } from "@/shared/hooks/use-theme";
import { Avatar, AvatarFallback } from "@/shared/shadcn/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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

  // Hardcoded demo user info
  const displayName = "Demo User";
  const displayEmail = "demo@example.com";
  const initials = "DU";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              // @modify: pl-2.5 使 size-5 Avatar 中心与导航项 size-4 图标中心垂直对齐
              className="pl-2.5 pr-3 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {/* @modify: size-5 略大于导航图标但视觉协调，rounded-md 适配小尺寸 */}
              <Avatar className="size-5 rounded-md">
                <AvatarFallback className="rounded-md text-[10px]">{initials}</AvatarFallback>
              </Avatar>
              {/* @modify: 折叠态文本不可见但保留占位空间 */}
              <span className="truncate text-sm leading-5 font-medium group-data-[collapsible=icon]:opacity-0">
                {displayName}
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
            {/* User Info */}
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{displayEmail}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Profile */}
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <HugeiconsIcon icon={UserCircleIcon} />
                {tDashboard("user.profile")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
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
