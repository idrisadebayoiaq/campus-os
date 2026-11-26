"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CampusLogo } from "@/components/campus-logo";
import { NavIcon } from "@/components/nav-icons";
import { useTheme } from "@/components/theme-provider";
import { groupNav, initialsFromName, navForPersonas } from "@/lib/nav";
import { PERSONA_LABEL, homeFor, type Persona } from "@/lib/persona";

type ShellUser = {
  id: string;
  email: string | null;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  personas: Persona[];
};

export function PortalShell({
  user,
  children,
}: {
  user: ShellUser | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem("campusos-portal-sidebar") === "collapsed") {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("campusos-portal-sidebar", next ? "collapsed" : "open");
      return next;
    });
  }

  if (!user) {
    return (
      <div className="flex min-h-full flex-col">
        <header className="border-b border-border bg-bg">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <CampusLogo href="/login" showWordmark />
            <nav className="flex items-center gap-3 text-sm">
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border"
                aria-label="Toggle theme"
              >
                <NavIcon name={theme === "dark" ? "sun" : "moon"} />
              </button>
              <Link href="/login" className="text-muted hover:text-fg">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
              >
                Sign up
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    );
  }

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && href !== "/admin" && pathname.startsWith(href));

  const navGroups = groupNav(navForPersonas(user.personas));
  const home = homeFor(user.personas);
  const personaLabel = user.personas.map((p) => PERSONA_LABEL[p]).join(" · ");

  const navClass = (active: boolean) =>
    `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
      active
        ? "bg-accent-soft font-semibold text-fg"
        : "text-muted hover:bg-surface hover:text-fg"
    } ${collapsed ? "justify-center" : ""}`;

  const renderNav = (showLabels: boolean) =>
    navGroups.map((section) => (
      <div key={section.group} className="space-y-1">
        {showLabels ? (
          <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {section.group}
          </p>
        ) : (
          <div className="mx-2 my-2 border-t border-border first:hidden" />
        )}
        {section.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={navClass(isActive(item.href))}
          >
            <NavIcon name={item.icon} />
            {showLabels ? <span className="truncate">{item.label}</span> : null}
          </Link>
        ))}
      </div>
    ));

  const sidebarInner = (
    <>
      <div
        className={`flex h-14 shrink-0 items-center border-b border-border px-3 ${
          collapsed ? "justify-center" : "justify-between gap-2"
        }`}
      >
        <CampusLogo href={home} size={collapsed ? 32 : 36} collapsed={collapsed} />
        {!collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-md border border-border lg:inline-flex"
            aria-label="Collapse sidebar"
          >
            <NavIcon name="panel" className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {renderNav(!collapsed)}
      </nav>
      <div className={`shrink-0 border-t border-border p-3 ${collapsed ? "flex justify-center" : ""}`}>
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent">
            {initialsFromName(user.displayName)}
          </span>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="truncate text-xs text-muted">@{user.username}</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh bg-bg text-fg">
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-bg lg:flex ${
          collapsed ? "w-[4.5rem]" : "w-[16.5rem]"
        }`}
      >
        {sidebarInner}
      </aside>
      <div
        className={`hidden shrink-0 lg:block ${collapsed ? "w-[4.5rem]" : "w-[16.5rem]"}`}
        aria-hidden
      />

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-border bg-bg shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-3">
              <CampusLogo href={home} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md border border-border px-2 py-1 text-xs"
              >
                Close
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-2">
              {navGroups.map((section) => (
                <div key={section.group} className="space-y-1">
                  <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {section.group}
                  </p>
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={navClass(isActive(item.href)).replace("justify-center", "")}
                    >
                      <NavIcon name={item.icon} />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/95 px-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <NavIcon name="menu" />
            </button>
            {collapsed ? (
              <button
                type="button"
                className="hidden h-9 w-9 items-center justify-center rounded-md border border-border lg:inline-flex"
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
              >
                <NavIcon name="panel" />
              </button>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="truncate text-xs text-muted">{personaLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-surface"
            aria-label="Toggle theme"
          >
            <NavIcon name={theme === "dark" ? "sun" : "moon"} />
          </button>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
