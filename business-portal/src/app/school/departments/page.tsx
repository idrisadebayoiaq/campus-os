import { redirect } from "next/navigation";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { SchoolDepartmentForm } from "@/components/school-department-form";

export const metadata = { title: "Departments" };
export const instant = false;

export default async function SchoolDepartmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/school/departments");

  const { data: authority } = await supabase
    .from("school_authority_profiles")
    .select("institution_id, institutions(id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!authority) redirect("/dashboard");

  const institutionId = authority.institution_id;
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, created_at")
    .eq("institution_id", institutionId)
    .order("name");

  const inst = Array.isArray(authority.institutions)
    ? authority.institutions[0]
    : authority.institutions;

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-10">
        <PageHeader
          title="Departments"
          description={`Manage departments for ${(inst as { name?: string } | null)?.name || "your school"}.`}
        />
        <SchoolDepartmentForm institutionId={institutionId} />
        <ul className="divide-y divide-border rounded-xl border border-border">
          {(departments ?? []).map((d) => (
            <li key={d.id} className="px-4 py-3 text-sm font-medium">
              {d.name}
            </li>
          ))}
          {!departments?.length ? (
            <li className="px-4 py-6 text-sm text-muted">No departments yet.</li>
          ) : null}
        </ul>
      </div>
    </Container>
  );
}
