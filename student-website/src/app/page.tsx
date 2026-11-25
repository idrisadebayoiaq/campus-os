import Image from "next/image";
import Link from "next/link";
import { DownloadButtons } from "@/components/download-buttons";
import { APP_VERSION } from "@/lib/downloads";

export const metadata = {
  title: "CampusOS — Campus life that fits your school",
  description:
    "Housing, study tools, food, marketplace, and AI tutoring for Nigerian students. Download CampusOS for Android and iOS.",
};

const PILLARS = [
  {
    title: "Campus housing",
    body: "Find rooms near your school with total move-in costs — rent, agent fees, caution, and more.",
  },
  {
    title: "Study Hub",
    body: "Timetable, CGPA, flashcards, focus timer, and an AI tutor tuned for tertiary courses.",
  },
  {
    title: "Food & market",
    body: "Campus vendors and peer listings scoped to the school you actually attend.",
  },
  {
    title: "Inbox & calls",
    body: "Message classmates, agents, and businesses — then jump into voice or video when you need to.",
  },
] as const;

export default function LandingPage() {
  return (
    <div>
      {/* Hero — brand first, one composition */}
      <section className="relative overflow-hidden bg-hero-bg text-hero-fg">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(171,159,242,0.35),transparent_55%),radial-gradient(ellipse_at_80%_70%,rgba(255,253,248,0.08),transparent_50%)]"
        />
        <div className="relative mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div className="anim-fade-up space-y-6">
            <p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">
              CampusOS
            </p>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-hero-fg sm:text-5xl lg:text-6xl">
              Campus life that fits your school
            </h1>
            <p className="max-w-lg text-base leading-7 text-hero-muted sm:text-lg">
              Housing, study tools, food, and marketplace — personalized once you
              pick your Nigerian tertiary campus.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/#download"
                className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-on-accent transition hover:opacity-90"
              >
                Download the app
              </Link>
              <Link
                href="/#about"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 px-6 text-sm font-medium text-hero-fg transition hover:bg-white/10"
              >
                What is CampusOS?
              </Link>
            </div>
          </div>

          <div className="anim-fade-up-delay relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="anim-float relative overflow-hidden rounded-[2.25rem] bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur-sm">
              <div className="overflow-hidden rounded-[1.85rem] bg-surface">
                <Image
                  src="/brand/CampusOS.png"
                  alt="CampusOS app"
                  width={720}
                  height={720}
                  className="h-auto w-full object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="scroll-mt-24 border-b border-border bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-semibold tracking-wide text-muted">About</p>
            <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              One app for the campus day
            </h2>
            <p className="text-base leading-7 text-muted">
              CampusOS keeps housing search, study planning, campus commerce, and
              messaging in one place — offline-ready on your phone, scoped to the
              school you attend.
            </p>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {PILLARS.map((item) => (
              <div
                key={item.title}
                className="rounded-[1.75rem] bg-surface px-6 py-7 ring-1 ring-border"
              >
                <h3 className="text-lg font-semibold text-fg">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download */}
      <section id="download" className="scroll-mt-24 bg-bg">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <div className="space-y-4">
            <p className="text-sm font-semibold tracking-wide text-muted">Download</p>
            <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Get CampusOS on your phone
            </h2>
            <p className="max-w-md text-base leading-7 text-muted">
              Prefer the stores when they&apos;re live, or install the latest Android
              APK directly. Current build: v{APP_VERSION}.
            </p>
            <p className="text-sm text-muted">
              Businesses and schools use the{" "}
              <span className="font-medium text-fg">CampusOS Portal</span> — students
              live in the mobile app.
            </p>
          </div>

          <div className="rounded-[2.25rem] bg-hero-bg p-6 text-hero-fg shadow-[0_24px_80px_rgba(60,49,91,0.25)] sm:p-8">
            <p className="text-sm text-hero-muted">Choose your install</p>
            <h3 className="mt-1 text-2xl font-semibold text-hero-fg">
              Play Store · App Store · APK
            </h3>
            <div className="mt-6">
              <DownloadButtons tone="onHero" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
