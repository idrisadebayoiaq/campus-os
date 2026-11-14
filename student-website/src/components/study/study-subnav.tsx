"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { STUDY_TOOLS } from "@/lib/study/links";

function toolActive(href: string, pathname: string) {
  if (href === "/study") return pathname === "/study";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function StudySubnavInner() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Study tools"
      className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
    >
      <ul className="flex min-w-max gap-1 pb-px">
        <li>
          <Link
            href="/study"
            className={`inline-flex h-9 items-center whitespace-nowrap rounded-t-md px-3 text-sm transition ${
              pathname === "/study"
                ? "border-b-2 border-fg font-medium text-fg"
                : "text-muted hover:text-fg"
            }`}
          >
            Hub
          </Link>
        </li>
        {STUDY_TOOLS.map((tool) => {
          const active = toolActive(tool.href, pathname);
          return (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className={`inline-flex h-9 items-center whitespace-nowrap rounded-t-md px-3 text-sm transition ${
                  active
                    ? "border-b-2 border-fg font-medium text-fg"
                    : "text-muted hover:text-fg"
                }`}
              >
                {tool.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StudySubnavFallback() {
  return (
    <div
      aria-hidden
      className="h-9 border-b border-border"
    />
  );
}

export function StudySubnav() {
  return (
    <Suspense fallback={<StudySubnavFallback />}>
      <StudySubnavInner />
    </Suspense>
  );
}