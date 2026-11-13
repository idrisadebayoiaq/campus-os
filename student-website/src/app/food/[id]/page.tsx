import { notFound } from "next/navigation";
import { FoodOrderForm } from "@/components/food-order-form";
import { Container, PageHeader } from "@/components/ui";
import { formatNaira, getStudentCampus } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function FoodVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const campus = await getStudentCampus(supabase);

  const { data: vendor } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("id", id)
    .eq("business_type", "food_vendor")
    .eq("is_active", true)
    .maybeSingle();

  if (!vendor) notFound();
  if (campus && vendor.campus_id !== campus.campusId) {
    return (
      <Container>
        <div className="py-12">
          <PageHeader
            title="Outside your campus"
            description="Outside your campus."
          />
        </div>
      </Container>
    );
  }

  const { data: menu } = await supabase
    .from("menu_items")
    .select("*")
    .eq("business_id", id)
    .eq("is_published", true)
    .eq("in_stock", true)
    .order("category");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Container>
      <div className="mx-auto max-w-3xl space-y-8 py-12">
        <PageHeader
          title={vendor.display_name}
          description={vendor.bio || "Pickup orders only on CampusOS for now."}
        />
        <div className="divide-y divide-border rounded-md border border-border">
          {(menu ?? []).map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-muted">
                  {item.category} · ~{item.prep_minutes} mins
                </p>
              </div>
              <p>{formatNaira(item.price)}</p>
            </div>
          ))}
          {!menu?.length ? (
            <p className="px-4 py-3 text-sm text-muted">Menu coming soon.</p>
          ) : null}
        </div>
        <FoodOrderForm
          businessId={vendor.id}
          campusId={vendor.campus_id}
          menu={menu ?? []}
          loggedIn={!!user}
        />
      </div>
    </Container>
  );
}
