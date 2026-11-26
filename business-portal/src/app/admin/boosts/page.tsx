import { redirect } from "next/navigation";
import { BoostQueue, type BoostItem } from "@/components/admin-trust-queues";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Boosts" };
export const instant = false;

export default async function AdminBoostsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) redirect("/dashboard");

  const { data: rows } = await supabase
    .from("listing_boosts")
    .select("id, entity_type, entity_id, days, amount, status, created_at, business_profiles(display_name)")
    .in("status", ["pending", "active"])
    .order("created_at", { ascending: false })
    .limit(100);

  const items: BoostItem[] = await Promise.all(
    (rows ?? []).map(async (r) => {
      let target = r.entity_type === "business" ? "Whole restaurant" : "Listing";
      if (r.entity_type === "property_unit") {
        target = (await supabase.from("property_units").select("title").eq("id", r.entity_id).maybeSingle()).data?.title ?? target;
      } else if (r.entity_type === "marketplace_listing") {
        target = (await supabase.from("marketplace_listings").select("title").eq("id", r.entity_id).maybeSingle()).data?.title ?? target;
      }
      const biz = Array.isArray(r.business_profiles) ? r.business_profiles[0] : r.business_profiles;
      return {
        id: r.id,
        business: (biz as { display_name?: string } | null)?.display_name ?? "",
        target,
        days: r.days,
        amount: Number(r.amount),
        status: r.status,
        created_at: r.created_at,
      };
    }),
  );

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader title="Featured boosts" description="Boosts turn on automatically after card payment. Activate by hand if a business paid offline." />
        {items.length ? <BoostQueue items={items} /> : <EmptyState title="No boosts" description="Requests appear here." />}
      </div>
    </Container>
  );
}
