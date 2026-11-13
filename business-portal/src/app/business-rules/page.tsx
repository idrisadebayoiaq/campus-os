import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Business rules" };

export default function BusinessRulesPage() {
  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-6 py-12">
        <PageHeader
          title="Business rules"
          description="Draft operating rules for Phase A0."
        />
        <div className="space-y-4 text-sm leading-6 text-muted">
          <p>
            Businesses must apply and wait for admin approval before publishing.
            Verified badges cannot be self-assigned.
          </p>
          <p>
            Keep prices, availability, and media accurate. Misleading listings
            can be removed and accounts suspended.
          </p>
          <p>
            Food vendors must accept or decline orders promptly. Do not claim
            certifications the platform has not verified.
          </p>
        </div>
      </div>
    </Container>
  );
}
