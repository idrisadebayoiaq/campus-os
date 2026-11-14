"use client";

import Image from "next/image";
import Link from "next/link";
import { useTheme } from "@/components/theme-provider";

export function CampusLogo({
  href = "/dashboard",
  size = 36,
  showWordmark = true,
  collapsed = false,
}: {
  href?: string;
  size?: number;
  showWordmark?: boolean;
  collapsed?: boolean;
}) {
  const { theme } = useTheme();
  const src = theme === "dark" ? "/brand/CampusOS.png" : "/brand/Black-CampusOS.png";

  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5" aria-label="CampusOS">
      <span
        className="relative shrink-0 overflow-hidden rounded-xl ring-1 ring-border"
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt="CampusOS"
          width={size * 2}
          height={size * 2}
          className={`h-full w-full object-cover ${
            theme === "dark" ? "campus-logo-dark" : "campus-logo-light"
          }`}
          priority
        />
      </span>
      {showWordmark && !collapsed ? (
        <span className="truncate text-sm font-semibold tracking-tight">
          CampusOS Portal
        </span>
      ) : null}
    </Link>
  );
}
