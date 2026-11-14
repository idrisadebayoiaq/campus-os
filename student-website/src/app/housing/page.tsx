import Link from "next/link";
import { Suspense } from "react";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { formatNaira, getStudentCampus, unitTotal } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Housing" };

async function HousingResults({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const type = typeof params.type === "string" ? params.type : "";
  const max = typeof params.max === "string" ? Number(params.max) : undefined;
  const area = typeof params.area === "string" ? params.area : "";

  const supabase = await createClient();
  const campus = await getStudentCampus(supabase);

  if (!campus) {
    return (
      <EmptyState
        title="Choose your campus first"
        description="Pick a school first."
      />
    );
  }

  let query = supabase
    .from("property_units")
    .select(
      "id, title, unit_type, rent_base, fee_agent, fee_agreement, fee_caution, fee_service, status, amenities, properties!inner(id, title, campus_id, area_id, verification_label, availability_checked_at, is_published, lat, lng, campus_areas(name))",
    )
    .eq("is_published", true)
    .eq("status", "available")
    .eq("properties.is_published", true)
    .eq("properties.campus_id", campus.campusId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (type) query = query.eq("unit_type", type);

  const { data: units } = await query;
  const { data: areas } = await supabase
    .from("campus_areas")
    .select("id, name")
    .eq("campus_id", campus.campusId)
    .order("name");

  const filtered = (units ?? []).filter((unit) => {
    const total = unitTotal(unit);
    if (max && total > max) return false;
    const property = Array.isArray(unit.properties) ? unit.properties[0] : unit.properties;
    if (area && property?.area_id !== area) return false;
    // Limit unverified exposure
    if (property?.verification_label === "unverified") return false;
    return true;
  });

  const coverByUnit: Record<string, string> = {};
  if (filtered.length) {
    const { data: mediaRows } = await supabase
      .from("listing_media")
      .select("unit_id, url")
      .in(
        "unit_id",
        filtered.map((u) => u.id),
      )
      .order("sort_order");
    for (const row of mediaRows ?? []) {
      if (row.unit_id && !coverByUnit[row.unit_id]) {
        coverByUnit[row.unit_id] = row.url;
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
        Showing housing near{" "}
        <span className="font-medium text-fg">
          {campus.institutionName} · {campus.campusName}
        </span>
        . <Link href="/onboarding" className="underline underline-offset-2">Change campus</Link>
      </div>

      <form className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-4">
        <select name="type" defaultValue={type} className="h-11 rounded-md border border-border bg-bg px-3 text-sm">
          <option value="">All types</option>
          <option value="room">Room</option>
          <option value="self_contained">Self contained</option>
          <option value="shared_apartment">Shared apartment</option>
          <option value="hostel_bed">Hostel bed</option>
        </select>
        <select name="area" defaultValue={area} className="h-11 rounded-md border border-border bg-bg px-3 text-sm">
          <option value="">All areas</option>
          {(areas ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <input
          name="max"
          type="number"
          defaultValue={max || ""}
          placeholder="Max total ₦"
          className="h-11 rounded-md border border-border bg-bg px-3 text-sm"
        />
        <button type="submit" className="h-11 rounded-md bg-inverse-bg text-sm text-inverse-fg">
          Filter
        </button>
      </form>

      {!filtered.length ? (
        <EmptyState
          title="No rooms for this campus yet"
          description="No matches — widen filters."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((unit) => {
            const property = Array.isArray(unit.properties) ? unit.properties[0] : unit.properties;
            const campusAreas = property?.campus_areas as
              | { name?: string | null }
              | { name?: string | null }[]
              | null
              | undefined;
            const areaName = Array.isArray(campusAreas)
              ? campusAreas[0]?.name
              : campusAreas?.name;
            const total = unitTotal(unit);
            const unitType = unit.unit_type.replaceAll("_", " ");
            const photoUrl = coverByUnit[unit.id];
            return (
              <Link
                key={unit.id}
                href={`/housing/${unit.id}`}
                className="overflow-hidden rounded-md border border-border transition hover:bg-surface"
              >
                <div className="aspect-[16/10] w-full border-b border-border bg-surface">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="space-y-2 p-4">
                  <p className="font-medium leading-snug">{unit.title}</p>
                  <p className="text-sm text-muted">
                    {areaName || "Nearby"} · <span className="capitalize">{unitType}</span>
                  </p>
                  {property?.title ? (
                    <p className="text-xs text-muted">{property.title}</p>
                  ) : null}
                  <p className="text-sm">
                    Total move-in{" "}
                    <span className="font-semibold tabular-nums">{formatNaira(total)}</span>
                  </p>
                  <p className="text-xs capitalize text-muted">
                    {(property?.verification_label || "unverified").replaceAll("_", " ")}
                    {property?.availability_checked_at &&
                    Date.now() - new Date(property.availability_checked_at).getTime() >
                      14 * 24 * 60 * 60 * 1000
                      ? " · needs reconfirm"
                      : ""}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HousingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Housing"
          description="Rooms near your campus."
        />
        <CampusScene
          mode="housing"
          title="Housing around campus"
          heightClass="h-48 sm:h-64"
          defaultOpen={false}
        />
        <Suspense fallback={<p className="text-sm text-muted">Loading campus housing…</p>}>
          <HousingResults searchParams={searchParams} />
        </Suspense>
        <ButtonLink href="/onboarding" variant="secondary">
          Change campus
        </ButtonLink>
      </div>
    </Container>
  );
}
