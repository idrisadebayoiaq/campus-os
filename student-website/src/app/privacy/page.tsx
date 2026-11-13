import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-6 py-12">
        <PageHeader
          title="Privacy"
          description="Draft notice for Phase A0. Final legal text needs professional review before public launch."
        />
        <div className="space-y-4 text-sm leading-6 text-muted">
          <p>
            CampusOS collects account details, campus membership, and activity
            needed to operate housing discovery and related student tools.
          </p>
          <p>
            Government IDs and landlord verification documents are stored for
            business applications in restricted storage and are not shown on the
            student website.
          </p>
          <p>
            Nigeria&apos;s Data Protection Act, 2023 is the baseline legal
            reference. Contact support to request correction, export, or
            deletion pathways once those flows ship.
          </p>
        </div>
      </div>
    </Container>
  );
}
