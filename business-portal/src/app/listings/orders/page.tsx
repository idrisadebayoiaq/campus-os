import { redirect } from "next/navigation";
import { LiveTables } from "@/components/live-tables";
import { OrderBoard } from "@/components/order-board";
import { PauseOrders } from "@/components/pause-orders";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const kitchens = (await myBusinesses(supabase, user.id)).filter((b) => b.business_type === "food_vendor");
  const ids = kitchens.map((b) => b.id);
  if (!ids.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No food business" description="Approve a food vendor profile first." />
        </div>
      </Container>
    );
  }

  const { data: orders } = await supabase
    .from("food_orders")
    .select(
      "id, status, total, notes, created_at, prep_minutes, decline_reason, student_id, fulfilment, delivery_address, delivery_fee, discount, promo_code, payment_method, payment_status, food_order_items(name, quantity, unit_price, options)",
    )
    .in("business_id", ids)
    .order("created_at", { ascending: false })
    .limit(200);

  const studentIds = [...new Set((orders ?? []).map((o) => o.student_id))];
  const [{ data: verified }, { data: names }] = studentIds.length
    ? await Promise.all([
        supabase.rpc("verified_student_ids", { p_ids: studentIds }),
        supabase.rpc("student_first_names", { p_ids: studentIds }),
      ])
    : [{ data: [] }, { data: [] }];
  const verifiedSet = new Set((verified ?? []) as string[]);
  const students: Record<string, { name: string; verified: boolean }> = {};
  for (const id of studentIds) {
    students[id] = {
      name: ((names ?? []) as { id: string; first_name: string }[]).find((n) => n.id === id)?.first_name || "Student",
      verified: verifiedSet.has(id),
    };
  }

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader title="Food orders" description="Kitchen board for CampusOS pickup and delivery orders." />
        {kitchens.map((k) => (
          <PauseOrders key={k.id} businessId={k.id} name={k.display_name} accepting={k.accepting_orders} />
        ))}
        {!orders?.length ? (
          <EmptyState title="No orders yet" description="Student orders will appear here." />
        ) : (
          <OrderBoard orders={orders} students={students} />
        )}
        <LiveTables tables={["food_orders"]} channel="kitchen-orders" />
      </div>
    </Container>
  );
}
