import { redirect } from "next/navigation";
import { OrderBoard } from "@/components/order-board";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: businesses } = await supabase
    .from("business_profiles")
    .select("id")
    .eq("owner_user_id", user.id)
    .eq("business_type", "food_vendor");
  const ids = (businesses ?? []).map((b) => b.id);
  if (!ids.length) {
    return (
      <Container>
        <div className="py-12">
          <EmptyState title="No food business" description="Approve a food vendor profile first." />
        </div>
      </Container>
    );
  }

  const { data: orders } = await supabase
    .from("food_orders")
    .select("id, status, total, notes, created_at, food_order_items(name, quantity, unit_price)")
    .in("business_id", ids)
    .order("created_at", { ascending: false });

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Food orders"
          description="Kitchen board for CampusOS pickup orders."
        />
        {!orders?.length ? (
          <EmptyState title="No orders yet" description="Student pickup orders will appear here." />
        ) : (
          <OrderBoard orders={orders} />
        )}
      </div>
    </Container>
  );
}
