import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { ThemeProvider } from "@/components/theme-provider";

export function MarketingShellServer({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <MarketingShell>{children}</MarketingShell>
    </ThemeProvider>
  );
}

/** Prerender / loading fallback — must still provide theme context for client children. */
export function MarketingShellFallback({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <div className="min-h-dvh bg-bg text-fg">{children}</div>
    </ThemeProvider>
  );
}
