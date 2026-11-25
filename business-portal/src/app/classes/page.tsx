import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Classes" };
export const instant = false;

export default async function ClassesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/classes");

  const { data: lecturer } = await supabase
    .from("lecturer_profiles")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!lecturer || lecturer.status !== "approved") {
    redirect("/apply/lecturer");
  }

  const { data: classes } = await supabase
    .from("class_offerings")
    .select("id, course_code, course_title, academic_session, semester, join_code, is_active")
    .eq("lecturer_user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <Container>
      <div className="space-y-8 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <PageHeader
            title="Your classes"
            description="Create classes, add students, publish timetables, and announce updates."
          />
          <ButtonLink href="/classes/new">New class</ButtonLink>
        </div>

        {!classes?.length ? (
          <EmptyState
            title="No classes yet"
            description="Create your first class to manage roster and timetable."
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {classes.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/classes/${c.id}`}
                  className="flex flex-col gap-1 px-4 py-3 hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {c.course_code} · {c.course_title}
                    </p>
                    <p className="text-sm text-muted">
                      {[c.academic_session, c.semester].filter(Boolean).join(" · ") ||
                        "No session set"}
                    </p>
                  </div>
                  <p className="text-sm text-muted">Join code {c.join_code}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
