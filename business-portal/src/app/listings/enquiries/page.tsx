import { redirect } from "next/navigation";
import { EnquiryBoard, type Enquiry } from "@/components/enquiry-board";
import { LiveTables } from "@/components/live-tables";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Enquiries" };
export const instant = false;

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function EnquiriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businesses = (await myBusinesses(supabase, user.id)).filter((b) =>
    ["housing_provider", "campus_service", "marketplace_seller"].includes(b.business_type),
  );
  if (!businesses.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No listings business" description="Enquiries appear once you have a housing, service or seller business." />
        </div>
      </Container>
    );
  }
  const ids = businesses.map((b) => b.id);

  const { data: rows } = await supabase
    .from("listing_enquiries")
    .select(
      "id, subject, message, status, created_at, student_id, business_id, property_units(title, properties(title)), marketplace_listings(title)",
    )
    .in("business_id", ids)
    .order("created_at", { ascending: false })
    .limit(300);

  const enquiryIds = (rows ?? []).map((r) => r.id);
  const studentIds = [...new Set((rows ?? []).map((r) => r.student_id))];

  const [{ data: convs }, { data: quick }, verifiedRes, namesRes] = await Promise.all([
    enquiryIds.length
      ? supabase.from("conversations").select("id, listing_enquiry_id").in("listing_enquiry_id", enquiryIds)
      : Promise.resolve({ data: [] as { id: string; listing_enquiry_id: string }[] }),
    supabase.from("business_quick_replies").select("id, business_id, label, body").in("business_id", ids).order("created_at"),
    studentIds.length ? supabase.rpc("verified_student_ids", { p_ids: studentIds }) : Promise.resolve({ data: [] }),
    studentIds.length ? supabase.rpc("student_first_names", { p_ids: studentIds }) : Promise.resolve({ data: [] }),
  ]);

  const verifiedSet = new Set((verifiedRes.data ?? []) as string[]);
  const students: Record<string, { name: string; verified: boolean }> = {};
  for (const id of studentIds) {
    students[id] = {
      name: ((namesRes.data ?? []) as { id: string; first_name: string }[]).find((n) => n.id === id)?.first_name || "Student",
      verified: verifiedSet.has(id),
    };
  }

  const enquiries: Enquiry[] = (rows ?? []).map((r) => {
    const unit = one(r.property_units as Rel<{ title: string; properties: Rel<{ title: string }> }>);
    const property = unit ? one(unit.properties) : null;
    const market = one(r.marketplace_listings as Rel<{ title: string }>);
    const listing = market?.title || (property ? `${property.title} · ${unit?.title}` : null) || r.subject || "General";
    return {
      id: r.id,
      subject: r.subject,
      message: r.message,
      status: r.status === "resolved" ? "resolved" : "open",
      created_at: r.created_at,
      student_id: r.student_id,
      business_id: r.business_id,
      listing,
      conversation_id: (convs ?? []).find((c) => c.listing_enquiry_id === r.id)?.id ?? null,
      lastReply: null,
    };
  });

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Enquiries"
          description="Questions students sent about your listings, grouped by listing. Reply fast to rank higher."
        />
        <EnquiryBoard
          userId={user.id}
          enquiries={enquiries}
          students={students}
          quickReplies={quick ?? []}
          businessId={ids[0]}
        />
        <LiveTables tables={["listing_enquiries"]} channel="enquiries-board" />
      </div>
    </Container>
  );
}
