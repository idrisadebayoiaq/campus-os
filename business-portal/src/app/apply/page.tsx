import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { BUSINESS_TYPES } from "@/lib/business-types";

export const metadata = { title: "Get started" };

const OPTIONS = [
  ...BUSINESS_TYPES.map((t) => ({
    href: `/apply/${t.key}`,
    title:
      t.key === "housing_provider"
        ? "Housing agent / landlord"
        : t.key === "food_vendor"
          ? "Restaurant / food vendor"
          : t.title,
    body: t.description,
  })),
  {
    href: "/apply/lecturer",
    title: "Lecturer",
    body: "Apply with your school email to run classes and send announcements.",
  },
];

export default function ApplyPage() {
  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="What do you do on campus?"
          description="Choose one. After approval your portal shows only the tools for that. You can't mix account types."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {OPTIONS.map((option) => (
            <div
              key={option.href}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-surface p-5"
            >
              <div className="space-y-2">
                <h2 className="text-lg font-medium">{option.title}</h2>
                <p className="text-sm leading-6 text-muted">{option.body}</p>
              </div>
              <ButtonLink href={option.href} variant="secondary">
                Continue
              </ButtonLink>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}
