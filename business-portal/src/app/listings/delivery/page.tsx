import { redirect } from "next/navigation";
import { DeliveryManager, type Zone } from "@/components/delivery-manager";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { canManage, myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Delivery" };
export const instant = false;

export default async function DeliveryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const kitchens = (await myBusinesses(supabase, user.id)).filter(
    (b) => b.business_type === "food_vendor" && canManage(b.role),
  );
  if (!kitchens.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No food business" description="Only owners and managers can set delivery." />
        </div>
      </Container>
    );
  }

  const { data: zones } = await supabase
    .from("delivery_zones")
    .select("id, business_id, label, radius_km, fee, min_order, is_active")
    .in("business_id", kitchens.map((k) => k.id))
    .order("radius_km");

  return (
    <Container>
      <div className="space-y-10 py-8 sm:py-12">
        <PageHeader
          title="Delivery"
          description="Choose how far you deliver and what you charge. Students outside every zone can still pick up."
        />
        {kitchens.map((k) => (
          <section key={k.id} className="space-y-3">
            {kitchens.length > 1 ? <h2 className="text-lg font-medium">{k.display_name}</h2> : null}
            <DeliveryManager
              businessId={k.id}
              hasLocation={k.lat != null && k.lng != null}
              zones={((zones ?? []).filter((z) => z.business_id === k.id) as unknown as Zone[])}
            />
          </section>
        ))}
      </div>
    </Container>
  );
}
