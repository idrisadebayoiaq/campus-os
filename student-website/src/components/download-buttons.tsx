import type { ReactNode } from "react";
import {
  APP_STORE_HREF,
  APP_STORE_READY,
  APP_VERSION,
  APK_HREF,
  PLAY_STORE_HREF,
  PLAY_STORE_READY,
} from "@/lib/downloads";
import { ApkIcon, AppStoreIcon, PlayStoreIcon } from "@/components/store-icons";

function StoreCard({
  href,
  ready,
  title,
  subtitle,
  icon,
  badge,
  tone = "default",
}: {
  href: string;
  ready: boolean;
  title: string;
  subtitle: string;
  icon: ReactNode;
  badge?: string;
  tone?: "default" | "onHero";
}) {
  const onHero = tone === "onHero";
  const className = onHero
    ? "group flex w-full items-center gap-4 rounded-[1.75rem] border border-white/15 bg-white/5 px-5 py-4 text-left transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55"
    : "group flex w-full items-center gap-4 rounded-[1.75rem] border border-border bg-bg px-5 py-4 text-left transition hover:border-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55";

  const body = (
    <>
      <span
        className={
          onHero
            ? "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-hero-fg ring-1 ring-white/15"
            : "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface text-fg ring-1 ring-border transition group-hover:bg-accent-soft"
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-xs font-medium uppercase tracking-wide ${
            onHero ? "text-hero-muted" : "text-muted"
          }`}
        >
          {badge ?? (ready ? "Get the app" : "Coming soon")}
        </span>
        <span
          className={`mt-0.5 block text-base font-semibold ${
            onHero ? "text-hero-fg" : "text-fg"
          }`}
        >
          {title}
        </span>
        <span
          className={`mt-0.5 block text-sm ${
            onHero ? "text-hero-muted" : "text-muted"
          }`}
        >
          {subtitle}
        </span>
      </span>
    </>
  );

  if (!ready) {
    return (
      <button type="button" disabled className={className} aria-disabled>
        {body}
      </button>
    );
  }

  return (
    <a
      href={href}
      className={className}
      {...(href.startsWith("http")
        ? { target: "_blank", rel: "noopener noreferrer" }
        : { download: href.endsWith(".apk") ? true : undefined })}
    >
      {body}
    </a>
  );
}

export function DownloadButtons({
  tone = "default",
}: {
  tone?: "default" | "onHero";
}) {
  return (
    <div className="grid gap-3">
      <StoreCard
        tone={tone}
        href={PLAY_STORE_HREF}
        ready={PLAY_STORE_READY}
        title="Google Play"
        subtitle={
          PLAY_STORE_READY
            ? "Install from the Play Store"
            : "Listing goes live when approved"
        }
        icon={<PlayStoreIcon />}
      />
      <StoreCard
        tone={tone}
        href={APP_STORE_HREF}
        ready={APP_STORE_READY}
        title="App Store"
        subtitle={
          APP_STORE_READY
            ? "Install on iPhone and iPad"
            : "Listing goes live when approved"
        }
        icon={
          <AppStoreIcon
            className={`h-7 w-7 ${tone === "onHero" ? "text-hero-fg" : "text-fg"}`}
          />
        }
      />
      <StoreCard
        tone={tone}
        href={APK_HREF}
        ready
        title="Download APK"
        subtitle={`Direct install · v${APP_VERSION}`}
        badge="Android"
        icon={<ApkIcon />}
      />
    </div>
  );
}
