import { redirect } from "next/navigation";
import { InspectionBoard } from "@/components/inspection-board";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function InspectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: businesses } = await supabase
    .from("business_profiles")
    .select("id")
    .eq("owner_user_id", user.id);
  const ids = (businesses ?? []).map((b) => b.id);
  if (!ids.length) {
    return (
      <Container>
        <div className="py-12">
          <EmptyState title="No business yet" description="Approve and set up a housing business first." />
        </div>
      </Container>
    );
  }

  const { data: requests } = await supabase
    .from("inspection_requests")
    .select("id, status, message, preferred_at, created_at, property_units(title, properties!inner(business_id, title))")
    .order("created_at", { ascending: false });

  const mine = (requests ?? []).filter((req) => {
    const unit = Array.isArray(req.property_units) ? req.property_units[0] : req.property_units;
    const property = Array.isArray(unit?.properties) ? unit?.properties[0] : unit?.properties;
    return property && ids.includes(property.business_id);
  });

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Inspection requests"
          description="Accept, decline, or reschedule student viewing requests on CampusOS."
        />
        {!mine.length ? (
          <EmptyState title="No requests" description="Student inspection requests will appear here." />
        ) : (
          <InspectionBoard requests={mine} />
        )}
      </div>
    </Container>
  );
}
