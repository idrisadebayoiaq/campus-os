"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CampusLogo } from "@/components/campus-logo";
import { useTheme } from "@/components/theme-provider";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-10 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-fg transition hover:bg-accent-soft"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <CampusLogo href="/" size={36} />
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/#about"
              className="hidden rounded-full px-3 py-2 text-sm text-muted transition hover:text-fg sm:inline"
            >
              About
            </Link>
            <Link
              href="/#download"
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:opacity-90"
            >
              Download
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-sm font-semibold text-fg">CampusOS</p>
            <p className="mt-1 text-sm text-muted">
              Campus life, study tools, and housing — built for Nigerian students.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted">
            <Link href="/#download" className="hover:text-fg">
              Download
            </Link>
            <Link href="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-fg">
              Terms
            </Link>
            <Link href="/login" className="hover:text-fg">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
