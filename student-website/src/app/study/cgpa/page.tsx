import { CgpaPanel } from "@/components/study/cgpa-panel";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "CGPA" };
export const instant = false;

export default async function CgpaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: grades } = user
    ? await supabase.from("grade_entries").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
    : { data: [] };

  const { data: courses } = user
    ? await supabase.from("student_courses").select("id, code").eq("user_id", user.id)
    : { data: [] };

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="CGPA" description="Grades and targets." />
        <ButtonLink href="/study" variant="secondary">
          Study Hub
        </ButtonLink>
        <CgpaPanel grades={grades ?? []} courses={courses ?? []} />
      </div>
    </Container>
  );
}
