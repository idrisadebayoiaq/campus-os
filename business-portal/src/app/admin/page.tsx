import { Container, EmptyState, PageHeader, ButtonLink } from "@/components/ui";

export const metadata = { title: "Admin" };

export default function AdminHomePage() {
  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Admin console"
          description="Verification, moderation, and operations for CampusOS."
        />
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/admin/applications" variant="secondary">
            Applications
          </ButtonLink>
          <ButtonLink href="/admin/listings" variant="secondary">
            Listings
          </ButtonLink>
          <ButtonLink href="/admin/reports" variant="secondary">
            Reports
          </ButtonLink>
        </div>
        <EmptyState
          title="Staff queues"
          description="Review business applications, moderate inventory, and clear student reports."
        />
      </div>
    </Container>
  );
}
