import { NotifyForm } from "@/components/download/notify-form";
import { Button, Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Download CampusOS for Android" };

const FEATURES = [
  {
    title: "Housing",
    body: "Browse listings scoped to your campus, with move-in totals and verification labels.",
  },
  {
    title: "Study",
    body: "Courses, timetable, assignments, focus timer, and AI tutor in one hub.",
  },
  {
    title: "Inbox",
    body: "Messages with landlords and campus contacts without mixing campuses.",
  },
] as const;

export default function DownloadPage() {
  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-10 py-12">
        <PageHeader
          title="CampusOS for Android"
          description="The student APK is in development. Join the waitlist or check back here for the official build."
        />

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-fg">What you get</h2>
          <ul className="space-y-3 text-sm leading-6">
            {FEATURES.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fg" aria-hidden />
                <span>
                  <span className="font-medium text-fg">{item.title}</span>
                  <span className="text-muted"> — {item.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4 border-t border-border pt-8">
          <h2 className="text-sm font-medium text-fg">Get notified</h2>
          <NotifyForm />
        </section>

        <section className="space-y-3 border-t border-border pt-8">
          <h2 className="text-sm font-medium text-fg">Install APK</h2>
          <p className="text-sm text-muted">
            When we publish, this page will host the signed Android package. Until then, use the
            student website on mobile.
          </p>
          <Button type="button" disabled>
            Download APK — Coming soon
          </Button>
        </section>
      </div>
    </Container>
  );
}