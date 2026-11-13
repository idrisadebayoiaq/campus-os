import { CampusScene } from "@/components/campus-3d/campus-scene";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { BUSINESS_TYPES } from "@/lib/business-types";

export const metadata = { title: "Apply as business" };

export default function ApplyPage() {
  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Apply as business"
          description="Choose a business type, submit details and documents, then wait for admin approval before listing."
        />

        <CampusScene
          mode="business"
          title="Serve students where they already move"
          heightClass="h-48 sm:h-60"
          defaultOpen={false}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {BUSINESS_TYPES.map((type) => (
            <div
              key={type.key}
              className="flex flex-col justify-between gap-4 rounded-md border border-border p-5"
            >
              <div className="space-y-2">
                <h2 className="text-lg font-medium">{type.title}</h2>
                <p className="text-sm leading-6 text-muted">{type.description}</p>
              </div>
              <ButtonLink href={`/apply/${type.key}`} variant="secondary">
                Continue
              </ButtonLink>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}
