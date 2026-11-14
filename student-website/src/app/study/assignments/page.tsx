import { TasksPanel } from "@/components/study/tasks-panel";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Assignments" };
export const instant = false;

export default async function AssignmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tasks } = user
    ? await supabase
        .from("academic_tasks")
        .select("*")
        .eq("user_id", user.id)
        .order("due_at", { ascending: true })
    : { data: [] };

  const { data: courses } = user
    ? await supabase.from("student_courses").select("id, code").eq("user_id", user.id)
    : { data: [] };

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Assignments" description="Track due dates and coursework by course." />
        <TasksPanel tasks={tasks ?? []} courses={courses ?? []} />
      </div>
    </Container>
  );
}
