import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Download" };

export default function DownloadPage() {
  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <PageHeader
          title="Download the CampusOS student APK"
          description="Android app coming soon."
        />
        <div className="rounded-md border border-border bg-surface p-6">
          <p className="font-medium text-fg">APK not published yet</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Track B builds the Expo app after the CampusOS student website housing
            MVP is stable. This page is the future download entry point for students.
          </p>
        </div>
      </div>
    </Container>
  );
}
