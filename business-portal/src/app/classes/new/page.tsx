import { redirect } from "next/navigation";
import { ClassForm } from "@/components/class-form";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "New class" };
export const instant = false;

export default async function NewClassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/classes/new");

  const { data: lecturer } = await supabase
    .from("lecturer_profiles")
    .select("status, institution_id, department_id, campus_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!lecturer || lecturer.status !== "approved") {
    redirect("/apply/lecturer");
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name")
    .eq("institution_id", lecturer.institution_id)
    .order("name");

  return (
    <Container>
      <div className="mx-auto max-w-xl space-y-8 py-10">
        <PageHeader title="Create class" description="Students added later will receive timetable syncs." />
        <ClassForm
          institutionId={lecturer.institution_id}
          departmentId={lecturer.department_id}
          campusId={lecturer.campus_id}
          departments={departments ?? []}
        />
      </div>
    </Container>
  );
}
