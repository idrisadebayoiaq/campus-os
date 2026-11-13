import Link from "next/link";
import { CourseForm } from "@/components/study/course-form";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { getStudentCampus } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Courses" };
export const instant = false;

export default async function CoursesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <Container>
        <div className="py-12">
          <EmptyState title="Log in required" description="Log in to continue." />
        </div>
      </Container>
    );
  }

  const campus = await getStudentCampus(supabase, user.id);
  const { data: courses } = await supabase
    .from("student_courses")
    .select("*")
    .eq("user_id", user.id)
    .order("code");

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Courses"
          description="Your registered courses."
        />
        <ButtonLink href="/study" variant="secondary">
          Back to Study Hub
        </ButtonLink>

        <CourseForm campusId={campus?.campusId} />

        <div className="divide-y divide-border rounded-md border border-border">
          {courses?.length ? (
            courses.map((c) => (
              <Link
                key={c.id}
                href={`/study/courses/${c.id}`}
                className="block px-4 py-3 text-sm hover:bg-surface"
              >
                <p className="font-medium">
                  {c.code} · {c.title}
                </p>
                <p className="text-muted">
                  {c.units} units · {c.semester || "—"} · {c.status}
                </p>
              </Link>
            ))
          ) : (
            <p className="px-4 py-6 text-sm text-muted">No courses yet. Add your first course above.</p>
          )}
        </div>
      </div>
    </Container>
  );
}
