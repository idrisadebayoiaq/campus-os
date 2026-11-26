import { redirect } from "next/navigation";
import { LiveTables } from "@/components/live-tables";
import { TenancyManager, type TenancyRow, type UnitOption } from "@/components/tenancy-manager";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Tenants" };
export const instant = false;

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function TenanciesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const housing = (await myBusinesses(supabase, user.id)).filter((b) => b.business_type === "housing_provider");
  if (!housing.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No housing business" description="Tenants are tracked for housing providers." />
        </div>
      </Container>
    );
  }
  const ids = housing.map((b) => b.id);

  const [{ data: rows }, { data: unitRows }] = await Promise.all([
    supabase
      .from("tenancies")
      .select(
        "id, student_id, rent_amount, rent_period, next_due_on, start_date, end_date, status, checklist, property_units(title, properties(title)), rent_receipts(id, amount, paid_on, receipt_no)",
      )
      .in("business_id", ids)
      .order("created_at", { ascending: false }),
    supabase
      .from("property_units")
      .select("id, title, rent_base, status, properties!inner(title, business_id)")
      .in("properties.business_id", ids)
      .in("status", ["available", "reserved"]),
  ]);

  const studentIds = [...new Set((rows ?? []).map((r) => r.student_id))];
  const { data: names } = studentIds.length ? await supabase.rpc("student_first_names", { p_ids: studentIds }) : { data: [] };

  const tenancies: TenancyRow[] = (rows ?? []).map((r) => {
    const unit = one(r.property_units as Rel<{ title: string; properties: Rel<{ title: string }> }>);
    const prop = unit ? one(unit.properties) : null;
    return {
      id: r.id,
      unit: prop ? `${prop.title} · ${unit?.title}` : (unit?.title ?? "Room"),
      student: ((names ?? []) as { id: string; first_name: string }[]).find((n) => n.id === r.student_id)?.first_name || "Student",
      rent_amount: Number(r.rent_amount),
      rent_period: r.rent_period,
      next_due_on: r.next_due_on,
      start_date: r.start_date,
      end_date: r.end_date,
      status: r.status,
      checklist: (r.checklist ?? []) as TenancyRow["checklist"],
      receipts: ((r.rent_receipts ?? []) as TenancyRow["receipts"]).sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1)),
    };
  });

  const units: UnitOption[] = ((unitRows ?? []) as unknown as { id: string; title: string; rent_base: number; properties: Rel<{ title: string }> }[]).map((u) => ({
    id: u.id,
    label: `${one(u.properties)?.title ?? ""} · ${u.title}`,
    rent: Number(u.rent_base),
  }));

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Tenants"
          description="Track who lives where, send rent reminders and receipts, and share a move-in checklist."
        />
        <TenancyManager tenancies={tenancies} units={units} />
        <LiveTables tables={["tenancies"]} channel="tenancies-live" />
      </div>
    </Container>
  );
}
