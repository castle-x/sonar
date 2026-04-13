import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

import { useColorThemeSync } from "@/shared/hooks/use-theme";

function ThemeSync() {
  useColorThemeSync();
  return null;
}

function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ThemeSync />
      {children}
    </NextThemesProvider>
  );
}

export { ThemeProvider };
