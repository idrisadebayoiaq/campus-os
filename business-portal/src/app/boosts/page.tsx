import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BoostManager, type BoostRow, type Plan, type Target } from "@/components/boost-manager";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { canManage, myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Featured listings" };
export const instant = false;

export default async function BoostsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businesses = (await myBusinesses(supabase, user.id)).filter((b) => b.setup_complete && canManage(b.role));
  if (!businesses.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="Nothing to feature" description="Owners and managers of a set-up business can feature listings." />
        </div>
      </Container>
    );
  }
  const ids = businesses.map((b) => b.id);
  const housingIds = businesses.filter((b) => b.business_type === "housing_provider").map((b) => b.id);
  const marketIds = businesses.filter((b) => ["campus_service", "marketplace_seller"].includes(b.business_type)).map((b) => b.id);

  const [{ data: plans }, { data: boosts }, units, market] = await Promise.all([
    supabase.from("boost_plans").select("id, name, days, price").eq("is_active", true).order("sort_order"),
    supabase
      .from("listing_boosts")
      .select("id, business_id, entity_type, entity_id, status, days, amount, ends_at")
      .in("business_id", ids)
      .in("status", ["pending", "active"])
      .order("created_at", { ascending: false }),
    housingIds.length
      ? supabase
          .from("property_units")
          .select("id, title, properties!inner(title, business_id)")
          .eq("is_published", true)
          .in("properties.business_id", housingIds)
      : Promise.resolve({ data: [] as never[] }),
    marketIds.length
      ? supabase.from("marketplace_listings").select("id, title, business_id").eq("status", "active").in("business_id", marketIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const targets: Target[] = [
    ...businesses
      .filter((b) => b.business_type === "food_vendor")
      .map((b) => ({ business_id: b.id, entity_type: "business", entity_id: b.id, label: `${b.display_name} (restaurant)` })),
    ...((units.data ?? []) as unknown as { id: string; title: string; properties: { title: string; business_id: string } | { title: string; business_id: string }[] }[]).map((u) => {
      const p = Array.isArray(u.properties) ? u.properties[0] : u.properties;
      return { business_id: p.business_id, entity_type: "property_unit", entity_id: u.id, label: `${p.title} · ${u.title}` };
    }),
    ...((market.data ?? []) as { id: string; title: string; business_id: string }[]).map((m) => ({
      business_id: m.business_id,
      entity_type: "marketplace_listing",
      entity_id: m.id,
      label: m.title,
    })),
  ];

  const labelFor = (type: string, id: string) => targets.find((t) => t.entity_type === type && t.entity_id === id)?.label ?? "Listing";
  const rows: BoostRow[] = (boosts ?? []).map((b) => ({
    id: b.id,
    label: labelFor(b.entity_type, b.entity_id),
    status: b.status,
    days: b.days,
    amount: Number(b.amount),
    ends_at: b.ends_at,
  }));

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Featured listings"
          description="Pin a listing at the top of student search with a Featured tag. Boosts never change verification or reviews."
        />
        <Suspense fallback={null}>
          <BoostManager targets={targets} plans={(plans ?? []) as Plan[]} boosts={rows} />
        </Suspense>
      </div>
    </Container>
  );
}
