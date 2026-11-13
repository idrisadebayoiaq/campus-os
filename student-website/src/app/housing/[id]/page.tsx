import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { MapPin } from "@/components/map-pin";
import { HousingActions } from "@/components/housing-actions";
import { Container, PageHeader } from "@/components/ui";
import { trackEvent } from "@/lib/analytics";
import { formatNaira, getStudentCampus, unitTotal } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

async function HousingDetail({ id }: { id: string }) {
  const supabase = await createClient();
  const campus = await getStudentCampus(supabase);

  const { data: unit } = await supabase
    .from("property_units")
    .select(
      "*, properties(*, campus_areas(name), business_profiles(id, display_name, slug, verification_label))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!unit) notFound();
  const property = Array.isArray(unit.properties) ? unit.properties[0] : unit.properties;
  if (!property?.is_published || !unit.is_published) notFound();

  if (campus && property.campus_id !== campus.campusId) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Outside your campus"
          description="Outside your campus."
        />
        <Link href="/housing" className="underline underline-offset-2">
          Back to your campus housing
        </Link>
      </div>
    );
  }

  const business = Array.isArray(property.business_profiles)
    ? property.business_profiles[0]
    : property.business_profiles;
  const areaName = Array.isArray(property.campus_areas)
    ? property.campus_areas?.[0]?.name
    : property.campus_areas?.name;
  const total = unitTotal(unit);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await trackEvent(supabase, "housing_listing_view", {
    userId: user?.id,
    campusId: campus?.campusId || property.campus_id,
    entityType: "property_unit",
    entityId: unit.id,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title={unit.title}
        description={`${property.title} · ${areaName || "Nearby"} · ${unit.unit_type.replaceAll("_", " ")}`}
      />

      <MapPin lat={property.lat} lng={property.lng} />
      <CampusScene
        mode="housing"
        title="Near-campus housing context"
        heightClass="h-52 sm:h-64"
        defaultOpen={false}
      />

      <div className="grid gap-4 rounded-md border border-border p-5 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Base rent</p>
          <p className="mt-1">{formatNaira(unit.rent_base)} / {unit.rent_period}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Agent</p>
          <p className="mt-1">{formatNaira(unit.fee_agent)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Agreement</p>
          <p className="mt-1">{formatNaira(unit.fee_agreement)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Caution</p>
          <p className="mt-1">{formatNaira(unit.fee_caution)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Service</p>
          <p className="mt-1">{formatNaira(unit.fee_service)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Total move-in</p>
          <p className="mt-1 font-medium">{formatNaira(total)}</p>
        </div>
      </div>

      <div className="rounded-md border border-border p-5 text-sm">
        <p className="font-medium">Amenities</p>
        <p className="mt-2 text-muted">
          {(unit.amenities || []).join(", ") || "No amenities listed"}
        </p>
        <p className="mt-4 text-muted">{property.description || "No description."}</p>
        <p className="mt-4 text-xs capitalize text-muted">
          Verification: {(property.verification_label || "unverified").replaceAll("_", " ")}
        </p>
        {business?.slug ? (
          <p className="mt-2">
            Provider:{" "}
            <Link href={`/businesses/${business.slug}`} className="underline underline-offset-2">
              {business.display_name}
            </Link>
          </p>
        ) : null}
      </div>

      <p className="text-sm text-muted">
        Rent payment may happen off CampusOS for now. Always inspect in person before paying.
      </p>

      <a
        href={`https://wa.me/?text=${encodeURIComponent(`CampusOS housing: ${unit.title} — check this listing near ${campus?.campusName || "campus"}`)}`}
        target="_blank"
        rel="noreferrer"
        className="text-sm underline underline-offset-2"
      >
        Share on WhatsApp
      </a>

      <HousingActions unitId={unit.id} businessId={property.business_id} loggedIn={!!user} />
    </div>
  );
}

export default async function HousingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Container>
      <div className="mx-auto max-w-3xl space-y-8 py-12">
        <Suspense fallback={<p className="text-sm text-muted">Loading listing…</p>}>
          <HousingDetail id={id} />
        </Suspense>
      </div>
    </Container>
  );
}
