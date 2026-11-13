import { PlannerPanel } from "@/components/study/planner-panel";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Study planner" };
export const instant = false;

export default async function PlannerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: blocks } = user
    ? await supabase
        .from("study_plan_blocks")
        .select("*")
        .eq("user_id", user.id)
        .order("starts_at")
    : { data: [] };

  const { data: courses } = user
    ? await supabase.from("student_courses").select("id, code").eq("user_id", user.id)
    : { data: [] };

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Planner" description="Study blocks." />
        <ButtonLink href="/study" variant="secondary">
          Study Hub
        </ButtonLink>
        <PlannerPanel blocks={blocks ?? []} courses={courses ?? []} />
      </div>
    </Container>
  );
}
