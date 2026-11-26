import { redirect } from "next/navigation";
import { ReportQueue } from "@/components/report-queue";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Reports" };
export const instant = false;

export default async function AdminReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const isStaff = (roles ?? []).some((r) =>
    ["admin", "moderator"].includes(r.role),
  );
  if (!isStaff) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState
            title="Staff only"
            description="CampusOS report queues are limited to admin and moderator roles."
          />
        </div>
      </Container>
    );
  }

  const { data: rawReports } = await supabase
    .from("reports")
    .select("*, business_profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const reports = (rawReports ?? []).map((r) => {
    const biz = Array.isArray(r.business_profiles) ? r.business_profiles[0] : r.business_profiles;
    return { ...r, business_name: biz?.display_name ?? null };
  });

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Report queue"
          description="Fraud and listing reports. Reporter identity stays private on CampusOS."
        />
        {!reports?.length ? (
          <EmptyState
            title="No reports"
            description="Student reports from housing and marketplace will appear here."
          />
        ) : (
          <ReportQueue reports={reports} />
        )}
      </div>
    </Container>
  );
}
