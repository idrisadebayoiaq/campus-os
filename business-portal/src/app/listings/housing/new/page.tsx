import { redirect } from "next/navigation";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { PropertyForm } from "@/components/property-form";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function NewPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string }>;
}) {
  const { business } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("id", business || "")
    .eq("owner_user_id", user.id)
    .eq("business_type", "housing_provider")
    .eq("setup_complete", true)
    .maybeSingle();

  if (!biz) redirect("/listings");

  const { data: canPublish } = await supabase.rpc("business_can_publish", {
    biz_id: biz.id,
  });
  if (!canPublish) redirect(`/setup/${biz.id}`);

  const [{ data: areas }, { data: campus }] = await Promise.all([
    supabase.from("campus_areas").select("id, name").eq("campus_id", biz.campus_id).order("name"),
    supabase.from("campuses").select("lat, lng").eq("id", biz.campus_id).maybeSingle(),
  ]);
  const campusCenter =
    biz.lat != null && biz.lng != null
      ? { lat: biz.lat as number, lng: biz.lng as number }
      : campus?.lat != null && campus?.lng != null
        ? { lat: campus.lat as number, lng: campus.lng as number }
        : null;

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Add property"
          description={`Campus-scoped to your approved CampusOS business · ${biz.display_name}`}
        />
        <CampusScene
          mode="housing"
          title="Place listings near the hostel / gate zone"
          heightClass="h-48 sm:h-60"
          defaultOpen
        />
        <PropertyForm
          businessId={biz.id}
          campusId={biz.campus_id}
          campusCenter={campusCenter}
          areas={areas ?? []}
        />
      </div>
    </Container>
  );
}
