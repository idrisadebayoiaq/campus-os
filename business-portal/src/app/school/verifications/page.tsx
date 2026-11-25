import { redirect } from "next/navigation";
import { StudentVerificationReview } from "@/components/student-verification-review";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Student verifications" };
export const instant = false;

export default async function SchoolVerificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/school/verifications");

  const { data: authority } = await supabase
    .from("school_authority_profiles")
    .select("institution_id")
    .eq("user_id", user.id);

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleList = (roles ?? []).map((r) => r.role);
  const isStaff =
    roleList.includes("admin") ||
    roleList.includes("moderator") ||
    Boolean(authority?.length);

  if (!isStaff) redirect("/dashboard");

  const { data: pending } = await supabase
    .from("student_verifications")
    .select(
      "id, user_id, method, status, evidence_path, created_at, profiles!student_verifications_user_id_fkey(full_name, preferred_name)",
    )
    .eq("status", "pending")
    .eq("method", "id_document")
    .order("created_at", { ascending: true })
    .limit(50);

  return (
    <Container className="space-y-6 py-8">
      <PageHeader
        title="Student ID reviews"
        description="Approve or reject campus ID uploads. Staff-added students skip this."
      />
      <ul className="divide-y divide-border rounded-xl border border-border">
        {(pending ?? []).map((row) => {
          const profile = Array.isArray(row.profiles)
            ? row.profiles[0]
            : row.profiles;
          const name =
            (profile as { preferred_name?: string; full_name?: string } | null)
              ?.preferred_name ||
            (profile as { full_name?: string } | null)?.full_name ||
            row.user_id;
          return (
            <li key={row.id} className="space-y-3 p-4">
              <div>
                <p className="font-medium">{name}</p>
                <p className="text-sm text-muted">
                  {row.method} · {new Date(row.created_at).toLocaleString()}
                </p>
                {row.evidence_path ? (
                  <p className="mt-1 text-xs text-muted">
                    Evidence: {row.evidence_path}
                  </p>
                ) : null}
              </div>
              <StudentVerificationReview verificationId={row.id} />
            </li>
          );
        })}
        {!pending?.length ? (
          <li className="px-4 py-8 text-sm text-muted">No pending ID reviews.</li>
        ) : null}
      </ul>
    </Container>
  );
}
