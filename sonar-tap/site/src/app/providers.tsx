import "@/i18n"; // Initialize i18next
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocaleSync } from "@/shared/hooks/use-locale";
import { Toaster } from "@/shared/shadcn/sonner";
import { TooltipProvider } from "@/shared/shadcn/tooltip";
import { ApiErrorDialog } from "@/shared/wk/components/api-error-dialog";
import { ThemeProvider } from "@/shared/wk/components/theme-provider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

interface ProvidersProps {
  children: React.ReactNode;
}

function LocaleSync() {
  useLocaleSync();
  return null;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <LocaleSync />
          {children}
          <Toaster
            position="bottom-right"
            richColors
          />
          <ApiErrorDialog />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
