import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-6 py-12">
        <PageHeader
          title="Terms"
          description="Draft student terms for Phase A0. Not legal advice."
        />
        <div className="space-y-4 text-sm leading-6 text-muted">
          <p>
            CampusOS is a working product name. Listings and campus information
            are provided to help students discover housing and services. Always
            verify in person before paying anyone.
          </p>
          <p>
            Essential housing search remains free for students. Do not treat
            platform messaging as escrow, rent financing, or a guarantee of
            occupancy.
          </p>
          <p>
            Businesses must apply and operate through the separate business
            portal. This student website and future APK are for student use.
          </p>
        </div>
      </div>
    </Container>
  );
}
