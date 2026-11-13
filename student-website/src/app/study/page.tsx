import Link from "next/link";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { getStudentCampus } from "@/lib/campus";
import { STUDY_TOOLS } from "@/lib/study/links";
import { DAYS, type TimetableRow } from "@/lib/study/utils";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Study Hub" };
export const instant = false;

function todayDow() {
  return new Date().getDay();
}

export default async function StudyHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Container>
        <div className="py-12">
          <EmptyState
            title="Log in for study tools"
            description="Log in to continue."
          />
        </div>
      </Container>
    );
  }

  const campus = await getStudentCampus(supabase, user.id);

  const today = todayDow();
  const [{ data: timetable }, { data: tasks }, { data: exams }] = await Promise.all([
    supabase.from("timetable_entries").select("*").eq("user_id", user.id),
    supabase
      .from("academic_tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_done", false)
      .order("due_at", { ascending: true })
      .limit(20),
    supabase
      .from("exam_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(10),
  ]);

  const lecturesToday = (timetable ?? []).filter(
    (row: TimetableRow) => row.day_of_week === today,
  ).length;
  const pendingTasks = tasks?.length ?? 0;

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Study Hub"
          description="Tools for your semester."
        />

        {campus ? (
          <div className="rounded-md border border-border bg-surface px-4 py-4 text-sm">
            <p className="font-medium text-fg">
              {campus.institutionName} · {campus.campusName}
            </p>
            <p className="mt-1 text-muted">
              {[campus.city, campus.state].filter(Boolean).join(", ") || "Campus selected"}
            </p>
          </div>
        ) : (
          <NoCampusBanner />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border p-5">
            <p className="text-sm text-muted">Today&apos;s lectures ({DAYS[today]})</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{lecturesToday}</p>
          </div>
          <div className="rounded-md border border-border p-5">
            <p className="text-sm text-muted">Pending tasks</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{pendingTasks}</p>
          </div>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Study tools</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STUDY_TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="rounded-md border border-border p-5 hover:bg-surface"
              >
                <p className="font-medium">{tool.title}</p>
                <p className="mt-2 text-sm text-muted">{tool.body}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Upcoming</h2>
          <div className="divide-y divide-border rounded-md border border-border">
            {tasks?.length || exams?.length ? (
              <>
                {(tasks ?? []).slice(0, 5).map((t) => (
                  <div key={t.id} className="px-4 py-3 text-sm">
                    <p className="font-medium">Assignment · {t.title}</p>
                    <p className="text-muted">
                      {t.course_code || "General"}
                      {t.due_at ? ` · due ${new Date(t.due_at).toLocaleString()}` : ""}
                    </p>
                  </div>
                ))}
                {(exams ?? []).slice(0, 5).map((e) => (
                  <div key={e.id} className="px-4 py-3 text-sm">
                    <p className="font-medium">
                      Exam · {e.title || e.course_code}
                    </p>
                    <p className="text-muted">
                      {new Date(e.starts_at).toLocaleString()}
                      {e.venue ? ` · ${e.venue}` : ""}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <p className="px-4 py-6 text-sm text-muted">Nothing upcoming yet. Add assignments or exams.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/study/assignments" variant="secondary">
              Assignments
            </ButtonLink>
            <ButtonLink href="/study/exams" variant="secondary">
              Exams
            </ButtonLink>
          </div>
        </section>
      </div>
    </Container>
  );
}

function NoCampusBanner() {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-4 text-sm">
      <p className="font-medium">Choose a campus</p>
      <p className="mt-1 text-muted">
        CampusOS personalizes study tools once you finish onboarding.
      </p>
      <Link href="/onboarding" className="mt-3 inline-block underline underline-offset-2">
        Go to onboarding
      </Link>
    </div>
  );
}
