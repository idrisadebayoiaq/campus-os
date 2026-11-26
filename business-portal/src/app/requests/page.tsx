import { redirect } from "next/navigation";
import { PaymentRequestsPanel, type RequestRow } from "@/components/billing-panels";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { canManage, myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Payment requests" };
export const instant = false;

export default async function RequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const list = (await myBusinesses(supabase, user.id)).filter(
    (b) => canManage(b.role) && (b.business_type === "housing_provider" || b.business_type === "campus_service"),
  );
  if (!list.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="Payment requests" description="Housing providers and service providers can ask students for rent and fees here." />
        </div>
      </Container>
    );
  }
  const ids = list.map((b) => b.id);

  const [{ data: requestRows }, { data: tenancyRows }, planRows] = await Promise.all([
    supabase
      .from("payment_requests")
      .select("id, business_id, student_id, kind, title, amount, status, created_at")
      .in("business_id", ids)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("tenancies")
      .select("id, business_id, student_id, property_units(title)")
      .in("business_id", ids)
      .in("status", ["active", "upcoming"]),
    Promise.all(
      list.map(async (b) => {
        const { data } = await supabase.rpc("business_plan_state", { p_business: b.id });
        const s = data as { active?: boolean; in_grace?: boolean } | null;
        return [b.id, Boolean(s?.active || s?.in_grace)] as const;
      }),
    ),
  ]);
  const planOk = new Map(planRows);

  const nameIds = [...new Set([...(requestRows ?? []).map((r) => r.student_id), ...(tenancyRows ?? []).map((r) => r.student_id)])];
  const { data: nameRows } = nameIds.length ? await supabase.rpc("student_first_names", { p_ids: nameIds }) : { data: [] };
  const nameOf = (id: string) => ((nameRows ?? []) as { id: string; first_name: string }[]).find((n) => n.id === id)?.first_name || "Student";

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader title="Payment requests" description="Ask a student to pay rent, a deposit or a fee. They pay from their CampusOS wallet and the money goes to your balance." />
        {list.map((b) => (
          <section key={b.id} className="space-y-4 rounded-3xl border border-border p-5 sm:p-7">
            <h2 className="text-lg font-semibold">{b.display_name}</h2>
            <PaymentRequestsPanel
              businessId={b.id}
              housing={b.business_type === "housing_provider"}
              isOwner={b.role === "owner"}
              locked={!planOk.get(b.id)}
              requests={(requestRows ?? [])
                .filter((r) => r.business_id === b.id)
                .map((r) => ({
                  id: r.id,
                  student: nameOf(r.student_id),
                  kind: r.kind,
                  title: r.title,
                  amount: Number(r.amount),
                  status: r.status,
                  created_at: r.created_at,
                })) as RequestRow[]}
              tenancies={(tenancyRows ?? [])
                .filter((t) => t.business_id === b.id)
                .map((t) => {
                  const u = Array.isArray(t.property_units) ? t.property_units[0] : t.property_units;
                  return { id: t.id, label: `${nameOf(t.student_id)} · ${u?.title ?? "Room"}` };
                })}
            />
          </section>
        ))}
      </div>
    </Container>
  );
}
