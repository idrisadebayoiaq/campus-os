import { notFound, redirect } from "next/navigation";
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

  return (
    <Container>
      <div className="mx-auto max-w-3xl space-y-8 py-12">
        <PageHeader
          title={property.title}
          description={`${business.display_name} · ${property.is_published ? "Published" : "Draft"}`}
        />
        <UnitManager
          propertyId={property.id}
          units={property.property_units || []}
          isPublished={property.is_published}
        />
      </div>
    </Container>
  );
}
