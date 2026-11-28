import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClassAnnouncementForm } from "@/components/class-announcement-form";
import { ClassLmsPanel } from "@/components/class-lms-panel";
import { ClassRepButton } from "@/components/class-rep-button";
import { ClassRosterForm } from "@/components/class-roster-form";
import { ClassSettingsForm } from "@/components/class-settings-form";
import { ClassTimetableForm } from "@/components/class-timetable-form";
import { ScheduleMeetingForm } from "@/components/schedule-meeting-form";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Class" };
export const instant = false;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type RosterRow = {
  enrollment_id: string;
  user_id: string;
  name: string;
  email: string | null;
  matric_number: string | null;
  source: string;
  rep_role: string | null;
  rep_status: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  auto: "Added by department",
  code: "Joined with code",
  manual: "Added by you",
  csv: "Imported",
};

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/classes/${id}`);

  const { data: cls } = await supabase
    .from("class_offerings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!cls) notFound();
  if (cls.lecturer_user_id !== user.id) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const staff = (roles ?? []).some((r) => r.role === "admin" || r.role === "moderator");
    if (!staff) redirect("/classes");
  }

  const [{ data: roster }, { data: slots }, { data: announcements }, { data: departments }] =
    await Promise.all([
      supabase.rpc("class_roster", { p_class: id }),
      supabase
        .from("class_timetable_slots")
        .select("*")
        .eq("class_id", id)
        .order("day_of_week"),
      supabase
        .from("class_announcements")
        .select("id, title, body, created_at, author_role")
        .eq("class_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("departments").select("id, name").eq("institution_id", cls.institution_id).order("name"),
    ]);
  const students = (roster ?? []) as RosterRow[];
  const reps = students.filter((s) => s.rep_role);

  return (
    <Container>
      <div className="space-y-10 py-10">
        <div>
          <Link href="/classes" className="text-sm text-muted underline underline-offset-2">
            Back to classes
          </Link>
          <PageHeader
            title={`${cls.course_code} · ${cls.course_title}`}
            description={`Join code ${cls.join_code || "—"} · students can also be added by email.`}
          />
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Class settings</h2>
          <ClassSettingsForm
            classId={id}
            departmentId={cls.department_id}
            level={cls.level}
            autoEnroll={Boolean(cls.auto_enroll)}
            joinApproval={Boolean(cls.join_approval)}
            departments={departments ?? []}
          />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium">Roster · {students.length}</h2>
            <p className="text-sm text-muted">
              {reps.length
                ? `Reps: ${reps.map((r) => `${r.name}${r.rep_status === "invited" ? " (invited)" : ""}`).join(", ")}`
                : "Pick a class rep. They can post to the class and take attendance with a code, but can't change grades."}
            </p>
          </div>
          <ClassRosterForm classId={id} />
          <ul className="divide-y divide-border rounded-xl border border-border">
            {students.map((s) => (
              <li key={s.enrollment_id} className="space-y-3 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted">
                      {[s.matric_number, s.email, SOURCE_LABEL[s.source] ?? null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ClassRepButton classId={id} userId={s.user_id} repRole={s.rep_role} repStatus={s.rep_status} />
                </div>
                <ScheduleMeetingForm studentUserId={s.user_id} classId={id} studentLabel={s.name} />
              </li>
            ))}
            {!students.length ? (
              <li className="px-4 py-6 text-sm text-muted">No students enrolled yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Timetable</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {(slots ?? []).map((s) => (
              <li key={s.id} className="px-4 py-3 text-sm">
                {DAYS[s.day_of_week]} · {s.start_time}–{s.end_time}
                {s.venue ? ` · ${s.venue}` : ""}
              </li>
            ))}
            {!slots?.length ? (
              <li className="px-4 py-6 text-sm text-muted">No slots yet.</li>
            ) : null}
          </ul>
          <ClassTimetableForm classId={id} />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Announcements</h2>
          <ClassAnnouncementForm classId={id} />
          <ul className="space-y-3">
            {(announcements ?? []).map((a) => (
              <li key={a.id} className="rounded-xl border border-border px-4 py-3">
                <p className="font-medium">
                  {a.title}
                  {a.author_role && a.author_role !== "lecturer" ? (
                    <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold">Class rep</span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{a.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <ClassLmsPanel
          classId={id}
          enrollments={students.map((s) => ({ id: s.enrollment_id, student_user_id: s.user_id, name: s.name }))}
        />
      </div>
    </Container>
  );
}
