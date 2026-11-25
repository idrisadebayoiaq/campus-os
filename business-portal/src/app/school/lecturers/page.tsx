import { redirect } from "next/navigation";
import { LecturerReviewActions } from "@/components/lecturer-review-actions";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Approve lecturers" };
export const instant = false;

export default async function SchoolLecturersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/school/lecturers");

  const { data: authority } = await supabase
    .from("school_authority_profiles")
    .select("institution_id, institutions(name)")
    .eq("user_id", user.id);

  const institutionIds = (authority ?? []).map((a) => a.institution_id);
  if (!institutionIds.length) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roleList = (roles ?? []).map((r) => r.role);
    if (!roleList.includes("admin") && !roleList.includes("moderator")) {
      redirect("/dashboard");
    }
  }

  const query = supabase
    .from("lecturer_applications")
    .select(
      "id, full_name, personal_email, school_email, status, staff_title, note, created_at, institutions(name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: apps } = institutionIds.length
    ? await query.in("institution_id", institutionIds)
    : await query;

  const schoolName =
    authority?.[0] &&
    (Array.isArray(authority[0].institutions)
      ? authority[0].institutions[0]
      : authority[0].institutions);

  return (
    <Container>
      <div className="space-y-8 py-10">
        <PageHeader
          title="Lecturer approvals"
          description={
            (schoolName as { name?: string } | null)?.name
              ? `Review lecturer applications for ${(schoolName as { name: string }).name}.`
              : "Review lecturer applications for your school."
          }
        />
        <div className="space-y-4">
          {(apps ?? []).map((app) => (
            <article key={app.id} className="rounded-xl border border-border p-4">
              <p className="font-medium">{app.full_name}</p>
              <p className="text-sm text-muted">
                {app.school_email} · personal {app.personal_email}
              </p>
              <p className="text-sm capitalize text-muted">Status: {app.status}</p>
              {app.staff_title ? (
                <p className="text-sm text-muted">{app.staff_title}</p>
              ) : null}
              {app.note ? <p className="mt-1 text-sm text-muted">{app.note}</p> : null}
              <div className="mt-3">
                <LecturerReviewActions applicationId={app.id} />
              </div>
            </article>
          ))}
          {!apps?.length ? (
            <p className="text-sm text-muted">No applications for your school yet.</p>
          ) : null}
        </div>
      </div>
    </Container>
  );
}
