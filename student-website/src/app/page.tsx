import Link from "next/link";
import { ButtonLink, Container } from "@/components/ui";

export const metadata = {
  title: "CampusOS — Campus life, study tools, housing",
  description:
    "Housing-first Nigerian student platform for campus housing, study tools, food, marketplace, and AI tutoring.",
};

const FEATURES = [
  {
    title: "Campus housing",
    body: "Search rooms near your school with total move-in costs — rent, agent, caution, and more.",
  },
  {
    title: "Study Hub",
    body: "Timetable, CGPA, flashcards, mock CBT, and an AI tutor built for Nigerian tertiary courses.",
  },
  {
    title: "Food & market",
    body: "Find campus vendors and peer listings scoped to the school you actually attend.",
  },
  {
    title: "Inbox",
    body: "Message providers and keep housing enquiries, orders, and campus support in one place.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(10,10,10,0.06),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(250,250,250,0.08),_transparent_55%)]"
      />
      <Container>
        <div className="relative space-y-16 py-16 sm:py-24">
          <section className="mx-auto max-w-3xl space-y-6 text-center">
            <p className="text-sm font-medium tracking-wide text-muted">CampusOS</p>
            <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              Campus life that fits your school
            </h1>
            <p className="mx-auto max-w-xl text-base leading-7 text-muted sm:text-lg">
              Housing, study tools, food, and marketplace — personalized once you
              pick your Nigerian tertiary campus.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href="/signup">Create student account</ButtonLink>
              <ButtonLink href="/login" variant="secondary">
                Log in
              </ButtonLink>
            </div>
          </section>

          <section className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="space-y-2 border-t border-border pt-5">
                <h2 className="text-lg font-medium text-fg">{feature.title}</h2>
                <p className="text-sm leading-6 text-muted">{feature.body}</p>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-border bg-surface px-6 py-8 text-center sm:px-10">
            <h2 className="text-xl font-semibold tracking-tight">Ready for your campus?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Sign up, choose your school, and CampusOS scopes housing and tools to
              that campus only.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href="/signup">Get started</ButtonLink>
              <Link href="/download" className="text-sm underline underline-offset-2">
                Android app (coming soon)
              </Link>
            </div>
          </section>
        </div>
      </Container>
    </div>
  );
}
