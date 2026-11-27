import { redirect } from "next/navigation";
import { InspectionBoard, type OfferRow, type OpenSlot } from "@/components/inspection-board";
import { LiveTables } from "@/components/live-tables";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function InspectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ids = (await myBusinesses(supabase, user.id))
    .filter((b) => b.business_type === "housing_provider")
    .map((b) => b.id);
  if (!ids.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No business yet" description="Approve and set up a housing business first." />
        </div>
      </Container>
    );
  }

  const { data: requests } = await supabase
    .from("inspection_requests")
    .select(
      "id, status, message, preferred_at, created_at, student_id, provider_note, property_units(title, properties!inner(id, business_id, title))",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const mine = (requests ?? []).filter((req) => {
    const unit = Array.isArray(req.property_units) ? req.property_units[0] : req.property_units;
    const property = Array.isArray(unit?.properties) ? unit?.properties[0] : unit?.properties;
    return property && ids.includes(property.business_id);
  });

  const studentIds = [...new Set(mine.map((r) => r.student_id))];
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

  const requestIds = mine.map((r) => r.id);
  const { data: offerRows } = requestIds.length
    ? await supabase
        .from("payment_requests")
        .select("id, inspection_id, status, amount, rent_period, created_at")
        .in("inspection_id", requestIds)
        .order("created_at", { ascending: false })
    : { data: [] as OfferRow[] };

  const { data: slotRows } = await supabase
    .from("inspection_slots")
    .select("id, property_id, starts_at, capacity, properties!inner(business_id)")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(120);
  const mySlots = (slotRows ?? []).filter((s) => {
    const p = Array.isArray(s.properties) ? s.properties[0] : s.properties;
    return p && ids.includes(p.business_id);
  });
  const slotIds = mySlots.map((s) => s.id);
  const { data: taken } = slotIds.length
    ? await supabase
        .from("inspection_requests")
        .select("slot_id")
        .in("slot_id", slotIds)
        .in("status", ["requested", "accepted", "rescheduled"])
    : { data: [] as { slot_id: string }[] };
  const slots: OpenSlot[] = mySlots
    .map((s) => ({
      id: s.id,
      property_id: s.property_id,
      starts_at: s.starts_at,
      spots: s.capacity - (taken ?? []).filter((t) => t.slot_id === s.id).length,
    }))
    .filter((s) => s.spots > 0);

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Inspection requests"
          description="Accept, decline, or move viewing requests. After a viewing, send the student an offer: they pay from their wallet and move in."
        />
        {!mine.length ? (
          <EmptyState title="No requests" description="Student inspection requests will appear here." />
        ) : (
          <InspectionBoard requests={mine} students={students} slots={slots} offers={(offerRows ?? []) as OfferRow[]} />
        )}
        <LiveTables tables={["inspection_requests"]} channel="viewing-requests" />
      </div>
    </Container>
  );
}
