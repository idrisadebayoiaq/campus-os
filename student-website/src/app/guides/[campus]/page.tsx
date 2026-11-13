import Link from "next/link";
import { notFound } from "next/navigation";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { Container, PageHeader } from "@/components/ui";
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

        <div className="space-y-4 text-sm leading-6 text-muted">
          <p>
            Location: {match.city || "—"}
            {match.state ? `, ${match.state}` : ""}.
          </p>
          <p>
            Neighborhoods CampusOS indexes near this campus:{" "}
            {(areas ?? []).map((a) => a.name).join(", ") || "Coming soon"}.
          </p>
          <div className="rounded-md border border-border p-5">
            <p className="font-medium text-fg">Example move-in ranges (pilot)</p>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              <li>Shared room: ₦120,000 – ₦250,000 / year + fees</li>
              <li>Self-contained: ₦350,000 – ₦700,000 / year + fees</li>
              <li>Expect agent + agreement + caution on many off-campus listings</li>
            </ul>
          </div>
          <p>
            CampusOS keeps search scoped to the school you pick in onboarding. Results
            from other campuses stay hidden.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/housing" className="underline underline-offset-2">
            Browse housing
          </Link>
          <Link href="/food" className="underline underline-offset-2">
            Food nearby
          </Link>
          <Link href="/marketplace" className="underline underline-offset-2">
            Marketplace
          </Link>
        </div>
      </div>
    </Container>
  );
}
