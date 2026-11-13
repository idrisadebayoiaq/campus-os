import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MarketActions } from "@/components/market-actions";
import { Container, PageHeader } from "@/components/ui";
import { formatNaira, getStudentCampus } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

async function MarketDetail({ id }: { id: string }) {
  const supabase = await createClient();
  const campus = await getStudentCampus(supabase);
  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("*, business_profiles(id, display_name, slug)")
    .eq("id", id)
    .maybeSingle();

  if (!listing || listing.status !== "active") notFound();

  if (campus && listing.campus_id !== campus.campusId) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Outside your campus"
          description="Outside your campus."
        />
        <Link href="/marketplace" className="underline underline-offset-2">
          Back to your campus marketplace
        </Link>
      </div>
    );
  }

  const business = Array.isArray(listing.business_profiles)
    ? listing.business_profiles[0]
    : listing.business_profiles;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-8">
      <PageHeader
        title={listing.title}
        description={`${listing.kind} · ${listing.category}${listing.is_commercial ? " · commercial" : ""}`}
      />
      <div className="rounded-md border border-border p-5 text-sm">
        <p className="text-lg font-medium">
          {listing.price != null ? formatNaira(listing.price) : "Ask for price"}
        </p>
        <p className="mt-3 text-muted">{listing.description || "No description."}</p>
        {listing.condition ? (
          <p className="mt-3 text-muted">Condition: {listing.condition}</p>
        ) : null}
        {business?.slug ? (
          <p className="mt-4">
            Seller:{" "}
            <Link href={`/businesses/${business.slug}`} className="underline underline-offset-2">
              {business.display_name}
            </Link>
          </p>
        ) : null}
      </div>
      <MarketActions
        listingId={listing.id}
        businessId={listing.business_id || business?.id || null}
        loggedIn={!!user}
      />
    </div>
  );
}

export default async function MarketplaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <Suspense fallback={<p className="text-sm text-muted">Loading listing…</p>}>
          <MarketDetail id={id} />
        </Suspense>
      </div>
    </Container>
  );
}
