import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Privacy" };

const SECTIONS = [
  {
    title: "Draft notice",
    body: "This privacy overview is a Phase A0 draft. Final text requires professional legal review before public launch.",
  },
  {
    title: "Data we collect",
    body: "Account email and password (via Supabase Auth), profile name and username, campus and programme selections, housing preferences, study data you enter (courses, timetable, grades, notes), and usage events needed to run the product.",
  },
  {
    title: "Campus scoping",
    body: "Your chosen campus limits housing, food, and marketplace results. We do not show other schools’ listings in your feed. Campus membership is stored with your profile and enforced in queries.",
  },
  {
    title: "AI usage",
    body: "AI tutor requests send your prompts and relevant study context to our AI provider to generate answers. Do not submit passwords, ID numbers, or payment details in chat. Conversation content may be logged for abuse prevention and quality while the feature is in beta.",
  },
  {
    title: "Messaging",
    body: "Inbox messages between you and businesses or peers are stored on CampusOS servers. They are not end-to-end encrypted today. Do not use inbox for sensitive financial transfers — rent is often handled off-platform.",
  },
  {
    title: "Business verification documents",
    body: "Government IDs and landlord documents submitted through the business portal live in restricted storage. They are not displayed on the student website.",
  },
  {
    title: "Your rights (Nigeria)",
    body: "Nigeria’s Data Protection Act, 2023 is our baseline reference. Contact support to request correction, export, or deletion once those self-service flows ship.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <PageHeader
          title="Privacy"
          description="How CampusOS handles student data — draft for review."
        />

        <p className="rounded-md border border-dashed border-border px-4 py-3 text-xs text-muted">
          Draft — not legal advice. Last updated for Phase A0 student website.
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