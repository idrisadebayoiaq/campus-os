import { notFound, redirect } from "next/navigation";
import { MediaManager, type MediaRow } from "@/components/media-manager";
import { UnitManager } from "@/components/unit-manager";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function ManagePropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: property } = await supabase
    .from("properties")
    .select("*, business_profiles!inner(owner_user_id, display_name), property_units(*)")
    .eq("id", id)
    .maybeSingle();

  if (!property) notFound();
  const business = Array.isArray(property.business_profiles)
    ? property.business_profiles[0]
    : property.business_profiles;
  if (business?.owner_user_id !== user.id) notFound();

  const { data: mediaRows } = await supabase
    .from("listing_media")
    .select("id, url, kind, caption, is_cover, sort_order, storage_path, unit_id")
    .eq("property_id", property.id)
    .order("sort_order", { ascending: true });

  const allMedia = (mediaRows ?? []) as (MediaRow & { unit_id: string | null })[];
  const propertyMedia = allMedia.filter((m) => !m.unit_id);
  const units = (property.property_units || []) as { id: string; title: string }[];

  return (
    <Container>
      <div className="mx-auto max-w-3xl space-y-8 py-12">
        <PageHeader
          title={property.title}
          description={`${business.display_name} · ${property.is_published ? "Published" : "Draft"}`}
        />

        <MediaManager
          userId={user.id}
          target={{ column: "property_id", id: property.id }}
          initial={propertyMedia}
          title="Property photos & videos"
          hint="outside, compound, shared areas"
          minPhotos={3}
        />

        <UnitManager
          propertyId={property.id}
          units={property.property_units || []}
          isPublished={property.is_published}
        />

        {units.length ? (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Room photos & videos</h2>
            {units.map((unit) => (
              <MediaManager
                key={unit.id}
                userId={user.id}
                target={{ column: "unit_id", id: unit.id, propertyId: property.id }}
                initial={allMedia.filter((m) => m.unit_id === unit.id)}
                title={unit.title}
                hint="bedroom, bathroom, kitchen"
              />
            ))}
          </div>
        ) : null}
      </div>
    </Container>
  );
}
