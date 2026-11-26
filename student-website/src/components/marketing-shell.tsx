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
            {[
              { href: "/#features", label: "Features" },
              { href: "/#how", label: "How it works" },
              { href: "/#faq", label: "FAQ" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hidden rounded-full px-3 py-2 text-sm text-muted transition hover:text-fg md:inline"
              >
                {link.label}
              </Link>
            ))}
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
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <CampusLogo href="/" size={36} />
            <p className="max-w-xs text-sm leading-6 text-muted">
              Housing, study tools, food, marketplace and AI tutoring — built for
              Nigerian students.
            </p>
          </div>
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-fg">Product</p>
            <Link href="/#features" className="block text-muted hover:text-fg">Features</Link>
            <Link href="/#how" className="block text-muted hover:text-fg">How it works</Link>
            <Link href="/#faq" className="block text-muted hover:text-fg">FAQ</Link>
          </div>
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-fg">Get the app</p>
            <Link href="/#download" className="block text-muted hover:text-fg">Google Play</Link>
            <Link href="/#download" className="block text-muted hover:text-fg">App Store</Link>
            <Link href="/#download" className="block text-muted hover:text-fg">Android APK</Link>
          </div>
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-fg">Company</p>
            <Link href="/privacy" className="block text-muted hover:text-fg">Privacy</Link>
            <Link href="/terms" className="block text-muted hover:text-fg">Terms</Link>
            <Link href="/login" className="block text-muted hover:text-fg">Sign in</Link>
          </div>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">
            © {new Date().getFullYear()} CampusOS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
