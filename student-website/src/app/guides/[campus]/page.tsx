import { notFound } from "next/navigation";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ campus: string }>;
}) {
  const { campus } = await params;
  return {
    title: `Campus guide · ${campus}`,
    description: "Honest CampusOS housing and campus life ranges for this school.",
  };
}

const TIPS = [
  {
    title: "Inspect before paying",
    body: "Visit the room in person. Photos and agent promises are not enough — check water, power, locks, and neighbors.",
  },
  {
    title: "Ask about total move-in",
    body: "Rent is only part of the cost. Confirm agent fee, agreement, caution, and service charges upfront on CampusOS listings.",
  },
  {
    title: "Prefer verified listings",
    body: "Look for verification labels and known providers. Unverified listings can still help discovery, but verify identity yourself.",
  },
] as const;

export default async function CampusGuidePage({
  params,
}: {
  params: Promise<{ campus: string }>;
}) {
  const { campus: slug } = await params;
  const supabase = await createClient();
  const { data: campuses } = await supabase
    .from("campuses")
    .select("id, name, city, state, institutions(name, short_name)")
    .eq("is_active", true);

  const match = (campuses ?? []).find((c) => {
    const institution = Array.isArray(c.institutions) ? c.institutions[0] : c.institutions;
    const key = `${institution?.short_name || institution?.name || ""}-${c.name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return key === slug || c.name.toLowerCase().replace(/\s+/g, "-") === slug;
  });

  if (!match) notFound();

  const institution = Array.isArray(match.institutions)
    ? match.institutions[0]
    : match.institutions;

  const { data: areas } = await supabase
    .from("campus_areas")
    .select("name")
    .eq("campus_id", match.id)
    .order("name");

  const areaNames = (areas ?? []).map((a) => a.name);

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <PageHeader
          title={`${institution?.name || "School"} · ${match.name}`}
          description="Example ranges — inspect before paying."
        />

        <CampusScene
          mode="overview"
          title={`${match.name} orientation`}
          heightClass="h-56 sm:h-72"
        />

        <p className="text-sm text-muted">
          Location: {match.city || "—"}
          {match.state ? `, ${match.state}` : ""}.
        </p>

        {areaNames.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-fg">Areas near campus</h2>
            <div className="flex flex-wrap gap-2">
              {areaNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-fg"
                >
                  {name}
                </span>
              ))}
            </div>
          </section>
        ) : (
          <p className="text-sm text-muted">
            Campus areas are being indexed for this school. Housing search still respects your
            selected campus.
          </p>
        )}

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-fg">Practical tips</h2>
          <ul className="space-y-4 text-sm leading-6">
            {TIPS.map((tip) => (
              <li key={tip.title}>
                <p className="font-medium text-fg">{tip.title}</p>
                <p className="mt-1 text-muted">{tip.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="rounded-md border border-border p-5 text-sm">
          <p className="font-medium text-fg">Example move-in ranges (pilot)</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
            <li>Shared room: ₦120,000 – ₦250,000 / year + fees</li>
            <li>Self-contained: ₦350,000 – ₦700,000 / year + fees</li>
            <li>Expect agent + agreement + caution on many off-campus listings</li>
          </ul>
        </div>

        <p className="text-sm leading-6 text-muted">
          CampusOS keeps search scoped to the school you pick in onboarding. Results from other
          campuses stay hidden.
        </p>

        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/housing">Browse housing</ButtonLink>
          <ButtonLink href="/food" variant="secondary">
            Food nearby
          </ButtonLink>
          <ButtonLink href="/marketplace" variant="secondary">
            Marketplace
          </ButtonLink>
        </div>
      </div>
    </Container>
  );
}