import { redirect } from "next/navigation";
import { AdminSchoolForm } from "@/components/admin-school-form";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Register schools" };
export const instant = false;

export default async function AdminSchoolsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/schools");

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleList = (roles ?? []).map((r) => r.role);
  if (!roleList.includes("admin") && !roleList.includes("moderator")) {
    redirect("/dashboard");
  }

  const { data: authorities } = await supabase
    .from("school_authority_profiles")
    .select(
      "id, title, created_at, institutions(name, short_name), profiles(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(40);

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-10">
        <PageHeader
          title="Register schools"
          description="Only CampusOS staff can register schools and link school authority accounts. Authorities must sign up on the portal first."
        />
        <AdminSchoolForm />

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Linked authorities</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {(authorities ?? []).map((row) => {
              const inst = Array.isArray(row.institutions)
                ? row.institutions[0]
                : row.institutions;
              const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
              return (
                <li key={row.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">
                    {(inst as { name?: string } | null)?.name || "School"}
                  </p>
                  <p className="text-muted">
                    {(profile as { full_name?: string } | null)?.full_name || "Authority"} ·{" "}
                    {row.title}
                  </p>
                </li>
              );
            })}
            {!authorities?.length ? (
              <li className="px-4 py-6 text-sm text-muted">No school authorities yet.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </Container>
  );
}
