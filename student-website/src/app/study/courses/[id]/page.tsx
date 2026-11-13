import { notFound } from "next/navigation";
import { CourseWorkspace } from "@/components/study/course-workspace";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function CourseWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: course } = await supabase
    .from("student_courses")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!course) notFound();

  const [
    { data: timetable },
    { data: tasks },
    { data: exams },
    { data: topics },
    { data: library },
    { data: mastery },
  ] = await Promise.all([
    supabase.from("timetable_entries").select("*").eq("user_id", user.id).eq("course_id", id),
    supabase.from("academic_tasks").select("*").eq("user_id", user.id).eq("course_id", id),
    supabase.from("exam_entries").select("*").eq("user_id", user.id).eq("course_id", id),
    supabase.from("syllabus_topics").select("*").eq("course_id", id).order("sort_order"),
    supabase.from("study_library_items").select("*").eq("user_id", user.id).eq("course_id", id),
    supabase.from("topic_mastery").select("*").eq("user_id", user.id).eq("course_id", id),
  ]);

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title={`${course.code} — ${course.title}`}
          description="Course workspace."
        />
        <ButtonLink href="/study/courses" variant="secondary">
          All courses
        </ButtonLink>
        <CourseWorkspace
          course={{
            id: course.id,
            code: course.code,
            title: course.title,
            units: Number(course.units),
          }}
          timetable={timetable ?? []}
          tasks={tasks ?? []}
          exams={exams ?? []}
          topics={topics ?? []}
          library={library ?? []}
          mastery={mastery ?? []}
        />
      </div>
    </Container>
  );
}
