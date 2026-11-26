"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CampusLogo } from "@/components/campus-logo";
import { useTheme } from "@/components/theme-provider";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
] as const;

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-fg transition hover:bg-accent-soft sm:w-auto sm:px-3"
      aria-label="Toggle theme"
    >
      <span className="sm:hidden" aria-hidden>
        {theme === "dark" ? "☀" : "☾"}
      </span>
      <span className="hidden text-xs font-medium sm:inline">
        {theme === "dark" ? "Light" : "Dark"}
      </span>
    </button>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <CampusLogo href="/" size={36} />
          <nav className="flex items-center gap-2 sm:gap-3">
            {NAV.map((link) => (
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
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-fg md:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </nav>
        </div>
        {menuOpen ? (
          <div className="border-t border-border bg-bg px-4 pb-4 pt-2 md:hidden">
            {NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-2xl px-3 py-3 text-base font-medium text-fg hover:bg-surface"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="block rounded-2xl px-3 py-3 text-base text-muted hover:bg-surface"
            >
              Sign in for live sessions
            </Link>
          </div>
        ) : null}
      </header>
      <main>{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6 sm:py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-10">
          <div className="col-span-2 space-y-3 sm:col-span-3 md:col-span-1">
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
            <Link href="/privacy" className="block text-muted hover:text-fg">Privacy Policy</Link>
            <Link href="/terms" className="block text-muted hover:text-fg">Terms of Service</Link>
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
