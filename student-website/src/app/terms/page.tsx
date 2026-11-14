import Link from "next/link";
import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Terms" };

const SECTIONS = [
  {
    title: "Draft terms",
    body: "These student terms are a Phase A0 draft. They are not legal advice and will change before a full public launch.",
  },
  {
    title: "Who this is for",
    body: "CampusOS student website and the future Android APK are for students. Businesses apply and operate through the separate business portal.",
  },
  {
    title: "Housing and listings",
    body: "Listings and price breakdowns are informational. CampusOS does not guarantee availability, condition, or that a landlord will honor quoted fees. Always inspect in person before paying.",
  },
  {
    title: "Campus scoping",
    body: "You agree to select an accurate campus during onboarding. Attempting to bypass campus limits to view other schools’ private inventory may result in account restrictions.",
  },
  {
    title: "AI tutor",
    body: "AI output may be wrong or incomplete. It is study assistance, not official academic advice, exam answers guaranteed correct, or a substitute for your lecturers.",
  },
  {
    title: "Messaging",
    body: "Inbox and notifications are not escrow, rent financing, or legal contracts. Deals you make with agents or landlords are between you and them.",
  },
  {
    title: "Acceptable use",
    body: "Do not spam, harass, post illegal content, or scrape the platform. We may suspend accounts that abuse housing, marketplace, or messaging features.",
  },
  {
    title: "Essential access",
    body: "Core housing discovery for students is intended to stay free. Paid features, if any, will be labeled clearly.",
  },
] as const;

export default function TermsPage() {
  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <PageHeader
          title="Terms of use"
          description="Student terms — draft for review."
        />

        <p className="rounded-md border border-dashed border-border px-4 py-3 text-xs text-muted">
          Draft — not legal advice. See also our{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>{" "}
          notice.
        </p>

        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-base font-medium text-fg">{section.title}</h2>
              <p className="text-sm leading-6 text-muted">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </Container>
  );
}