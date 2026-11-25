import { redirect } from "next/navigation";
import { LecturerReviewActions } from "@/components/lecturer-review-actions";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "All lecturer applications" };
export const instant = false;

export default async function AdminLecturersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/lecturers");

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleList = (roles ?? []).map((r) => r.role);
  if (!roleList.includes("admin") && !roleList.includes("moderator")) {
    redirect("/dashboard");
  }

  const { data: apps } = await supabase
    .from("lecturer_applications")
    .select(
      "id, full_name, personal_email, school_email, status, staff_title, note, created_at, institutions(name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <Container>
      <div className="space-y-8 py-10">
        <PageHeader
          title="Lecturer applications"
          description="CampusOS staff overview. School authorities also review apps for their institution."
        />
        <div className="space-y-4">
          {(apps ?? []).map((app) => {
            const inst = Array.isArray(app.institutions)
              ? app.institutions[0]
              : app.institutions;
            return (
              <article key={app.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{app.full_name}</p>
                    <p className="text-sm text-muted">
                      {(inst as { name?: string } | null)?.name} · {app.school_email}
                    </p>
                    <p className="text-sm capitalize text-muted">Status: {app.status}</p>
                    {app.note ? <p className="mt-1 text-sm text-muted">{app.note}</p> : null}
                  </div>
                </div>
                <div className="mt-3">
                  <LecturerReviewActions applicationId={app.id} />
                </div>
              </article>
            );
          })}
          {!apps?.length ? (
            <p className="text-sm text-muted">No lecturer applications yet.</p>
          ) : null}
        </div>
      </div>
    </Container>
  );
}
