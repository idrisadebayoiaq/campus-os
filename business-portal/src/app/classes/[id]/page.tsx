import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClassAnnouncementForm } from "@/components/class-announcement-form";
import { ClassLmsPanel } from "@/components/class-lms-panel";
import { ClassRosterForm } from "@/components/class-roster-form";
import { ClassTimetableForm } from "@/components/class-timetable-form";
import { ScheduleMeetingForm } from "@/components/schedule-meeting-form";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Class" };
export const instant = false;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

  const [{ data: enrollments }, { data: slots }, { data: announcements }] =
    await Promise.all([
      supabase
        .from("class_enrollments")
        .select(
          "id, status, student_user_id, profiles!class_enrollments_student_user_id_fkey(full_name, preferred_name)",
        )
        .eq("class_id", id)
        .eq("status", "active"),
      supabase
        .from("class_timetable_slots")
        .select("*")
        .eq("class_id", id)
        .order("day_of_week"),
      supabase
        .from("class_announcements")
        .select("id, title, body, created_at")
        .eq("class_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

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
          <h2 className="text-lg font-medium">Roster</h2>
          <ClassRosterForm classId={id} />
          <ul className="divide-y divide-border rounded-xl border border-border">
            {(enrollments ?? []).map((e) => {
              const p = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
              const name =
                (p as { preferred_name?: string; full_name?: string } | null)
                  ?.preferred_name ||
                (p as { full_name?: string } | null)?.full_name ||
                e.student_user_id;
              return (
                <li key={e.id} className="space-y-3 px-4 py-3 text-sm">
                  <p className="font-medium">{name}</p>
                  <ScheduleMeetingForm
                    studentUserId={e.student_user_id}
                    classId={id}
                    studentLabel={name}
                  />
                </li>
              );
            })}
            {!enrollments?.length ? (
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
                <p className="font-medium">{a.title}</p>
                <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{a.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <ClassLmsPanel
          classId={id}
          enrollments={(enrollments ?? []).map((e) => {
            const p = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
            const name =
              (p as { preferred_name?: string; full_name?: string } | null)?.preferred_name ||
              (p as { full_name?: string } | null)?.full_name ||
              e.student_user_id;
            return { id: e.id, student_user_id: e.student_user_id, name };
          })}
        />
      </div>
    </Container>
  );
}
