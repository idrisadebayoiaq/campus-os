import { ExamsPanel } from "@/components/study/exams-panel";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Exams" };
export const instant = false;

export default async function ExamsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: exams } = user
    ? await supabase
        .from("exam_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("starts_at")
    : { data: [] };

  const { data: courses } = user
    ? await supabase.from("student_courses").select("id, code, title").eq("user_id", user.id)
    : { data: [] };

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Exams" description="Upcoming exams." />
        <ButtonLink href="/study" variant="secondary">
          Study Hub
        </ButtonLink>
        <ExamsPanel exams={exams ?? []} courses={courses ?? []} />
      </div>
    </Container>
  );
}
