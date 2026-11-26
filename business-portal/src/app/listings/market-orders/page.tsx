import { redirect } from "next/navigation";
import { MarketOrderList, type MarketOrderRow } from "@/components/market-orders";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Paid orders" };
export const instant = false;

export default async function MarketOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sellers = (await myBusinesses(supabase, user.id)).filter((b) => b.business_type === "marketplace_seller" || b.business_type === "campus_service");
  if (!sellers.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No marketplace business" description="Paid orders are for marketplace sellers and campus services." />
        </div>
      </Container>
    );
  }

  const { data: rows } = await supabase
    .from("market_orders")
    .select("id, title, buyer_id, amount, status, created_at, accept_by, handover_by, release_at, cancel_requested_by, cancel_note, dispute_reason, ruling, ruling_note")
    .in("seller_business_id", sellers.map((s) => s.id))
    .order("created_at", { ascending: false })
    .limit(80);

  const buyerIds = [...new Set((rows ?? []).map((r) => r.buyer_id))];
  const { data: names } = buyerIds.length ? await supabase.rpc("student_first_names", { p_ids: buyerIds }) : { data: [] };
  const { data: pct } = await supabase.rpc("setting_num", { p_key: "marketplace_commission_pct", p_default: 2 });

  const orders: MarketOrderRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    buyer: ((names ?? []) as { id: string; first_name: string }[]).find((n) => n.id === r.buyer_id)?.first_name || "Student",
    amount: Number(r.amount),
    status: r.status,
    created_at: r.created_at,
    accept_by: r.accept_by,
    handover_by: r.handover_by,
    release_at: r.release_at,
    cancel_requested_by: r.cancel_requested_by,
    cancel_note: r.cancel_note,
    dispute_reason: r.dispute_reason,
    ruling: r.ruling,
    ruling_note: r.ruling_note,
  }));

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Paid orders"
          description="Students pay from their wallet and CampusOS holds the money until the handover is confirmed. Accept, hand over with the buyer's code and a photo, and the payment lands in your balance."
        />
        <MarketOrderList orders={orders} commissionPct={Number(pct ?? 2)} />
      </div>
    </Container>
  );
}
