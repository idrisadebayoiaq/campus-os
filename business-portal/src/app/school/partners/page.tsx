import { redirect } from "next/navigation";
import { PartnerList, PickupPointManager, type Partner, type PointRow } from "@/components/school-partners";
import { Container, PageHeader } from "@/components/ui";
import { businessTypeLabel } from "@/lib/business-types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Partners & pickup points" };
export const instant = false;

const LEVEL: Record<string, string> = { basic: "Basic", identity: "Owner ID checked", cac: "CAC verified" };

export default async function SchoolPartnersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/school/partners");

  const { data: authority } = await supabase
    .from("school_authority_profiles")
    .select("institution_id, institutions(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!authority) redirect("/dashboard");
  const institutionId = authority.institution_id;
  const inst = Array.isArray(authority.institutions) ? authority.institutions[0] : authority.institutions;

  const { data: campuses } = await supabase.from("campuses").select("id, name, lat, lng").eq("institution_id", institutionId).order("name");
  const campusIds = (campuses ?? []).map((c) => c.id);

  const [{ data: biz }, { data: endorsed }, { data: pts }] = await Promise.all([
    campusIds.length
      ? supabase
          .from("business_profiles")
          .select("id, display_name, business_type, verification_level")
          .in("campus_id", campusIds)
          .eq("setup_complete", true)
          .eq("is_active", true)
          .order("display_name")
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("school_endorsements").select("business_id").eq("institution_id", institutionId),
    campusIds.length
      ? supabase.from("pickup_points").select("id, campus_id, name, is_active, lat, lng").in("campus_id", campusIds).order("name")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const endorsedSet = new Set((endorsed ?? []).map((e) => e.business_id));
  const partners: Partner[] = ((biz ?? []) as { id: string; display_name: string; business_type: string; verification_level: string }[]).map((b) => ({
    id: b.id,
    name: b.display_name,
    type: businessTypeLabel(b.business_type),
    level: LEVEL[b.verification_level] ?? b.verification_level,
    endorsed: endorsedSet.has(b.id),
  }));
  const points: PointRow[] = ((pts ?? []) as { id: string; campus_id: string; name: string; is_active: boolean; lat: number | null; lng: number | null }[]).map((p) => ({
    ...p,
    campus: campuses?.find((c) => c.id === p.campus_id)?.name ?? "",
  }));

  return (
    <Container>
      <div className="mx-auto max-w-3xl space-y-10 py-10">
        <PageHeader
          title="Partners & pickup points"
          description={`Approve trusted businesses for ${(inst as { name?: string } | null)?.name || "your school"} and set where campus marketplace handovers happen.`}
        />
        <section className="space-y-3">
          <h2 className="text-lg font-medium">School-approved partners</h2>
          <p className="text-sm text-muted">Students at your school see a School-approved badge and can filter for approved businesses.</p>
          <PartnerList institutionId={institutionId} userId={user.id} partners={partners} />
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Campus pickup points</h2>
          <p className="text-sm text-muted">Safe, public spots sellers can choose for handing over items.</p>
          <PickupPointManager campuses={campuses ?? []} points={points} />
        </section>
      </div>
    </Container>
  );
}
