import { redirect } from "next/navigation";
import { JoinClassForm } from "@/components/join-class-form";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My classes" };
export const instant = false;

export default async function StudentClassesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/study/classes");

  const { data: enrollments } = await supabase
    .from("class_enrollments")
    .select(
      "id, status, class_id, class_offerings(id, course_code, course_title, join_code, academic_session, semester)",
    )
    .eq("student_user_id", user.id)
    .eq("status", "active");

  const classIds = (enrollments ?? [])
    .map((e) => e.class_id as string)
    .filter(Boolean);

  const [
    { data: announcements },
    { data: assignments },
    { data: liveSessions },
    { data: materials },
    { data: schoolAnnouncements },
  ] = await Promise.all([
    classIds.length
      ? supabase
          .from("class_announcements")
          .select("id, title, body, created_at, class_id")
          .in("class_id", classIds)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
    classIds.length
      ? supabase
          .from("class_assignments")
          .select("id, title, description, due_at, class_id")
          .in("class_id", classIds)
          .order("due_at", { ascending: true })
          .limit(30)
      : Promise.resolve({ data: [] as never[] }),
    classIds.length
      ? supabase
          .from("class_live_sessions")
          .select("id, title, mode, scheduled_at, status, room_name, join_url, class_id")
          .in("class_id", classIds)
          .in("status", ["scheduled", "live"])
          .order("scheduled_at", { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
    classIds.length
      ? supabase
          .from("class_materials")
          .select("id, title, description, link_url, file_url, class_id")
          .in("class_id", classIds)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("campus_memberships")
      .select("institution_id")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle()
      .then(async (res) => {
        const inst = res.data?.institution_id;
        if (!inst) return { data: [] as never[] };
        return supabase
          .from("school_announcements")
          .select("id, title, body, created_at")
          .eq("institution_id", inst)
          .in("audience", ["all", "students"])
          .order("created_at", { ascending: false })
          .limit(10);
      }),
  ]);

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-10">
        <PageHeader
          title="Classes"
          description="If your school is registered on CampusOS, you are auto-enrolled into matching department classes. You can also join with a code. Timetable, assignments, and live classes update here."
        />

        <JoinClassForm />

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Enrolled</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {(enrollments ?? []).map((e) => {
              const c = Array.isArray(e.class_offerings)
                ? e.class_offerings[0]
                : e.class_offerings;
              if (!c) return null;
              return (
                <li key={e.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">
                    {c.course_code} · {c.course_title}
                  </p>
                  <p className="text-muted">
                    {[c.academic_session, c.semester].filter(Boolean).join(" · ") || "Class"}
                  </p>
                </li>
              );
            })}
            {!enrollments?.length ? (
              <li className="px-4 py-6 text-sm text-muted">
                No classes yet. If your school is not registered, you can still use CampusOS —
                lecturer features appear after your school is onboarded.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Upcoming live classes</h2>
          <ul className="space-y-3">
            {(liveSessions ?? []).map((s) => (
              <li key={s.id} className="rounded-xl border border-border px-4 py-3 text-sm">
                <p className="font-medium">{s.title}</p>
                <p className="text-muted">
                  {s.mode} · {new Date(s.scheduled_at).toLocaleString()} · {s.status}
                </p>
                <a
                  href={
                    s.join_url ||
                    `/live/${encodeURIComponent(s.room_name)}?mode=${s.mode === "voice" ? "voice" : "video"}`
                  }
                  className="mt-2 inline-block underline underline-offset-2"
                >
                  Join {s.mode === "voice" ? "voice" : "video"}
                </a>
              </li>
            ))}
            {!liveSessions?.length ? (
              <li className="text-sm text-muted">No live sessions scheduled.</li>
            ) : null}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Assignments</h2>
          <ul className="space-y-3">
            {(assignments ?? []).map((a) => (
              <li key={a.id} className="rounded-xl border border-border px-4 py-3">
                <p className="font-medium">{a.title}</p>
                {a.due_at ? (
                  <p className="text-xs text-muted">Due {new Date(a.due_at).toLocaleString()}</p>
                ) : null}
                {a.description ? (
                  <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{a.description}</p>
                ) : null}
              </li>
            ))}
            {!assignments?.length ? (
              <li className="text-sm text-muted">No class assignments yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Materials</h2>
          <ul className="space-y-3">
            {(materials ?? []).map((m) => (
              <li key={m.id} className="rounded-xl border border-border px-4 py-3 text-sm">
                <p className="font-medium">{m.title}</p>
                {m.description ? <p className="text-muted">{m.description}</p> : null}
                <div className="mt-2 flex flex-wrap gap-3">
                  {m.link_url ? (
                    <a href={m.link_url} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                      Open link
                    </a>
                  ) : null}
                  {m.file_url ? (
                    <a href={m.file_url} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                      Download
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
            {!materials?.length ? (
              <li className="text-sm text-muted">No materials yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Class announcements</h2>
          <ul className="space-y-3">
            {(announcements ?? []).map((a) => (
              <li key={a.id} className="rounded-xl border border-border px-4 py-3">
                <p className="font-medium">{a.title}</p>
                <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{a.body}</p>
              </li>
            ))}
            {!announcements?.length ? (
              <li className="text-sm text-muted">No class announcements yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">School announcements</h2>
          <ul className="space-y-3">
            {(schoolAnnouncements ?? []).map((a) => (
              <li key={a.id} className="rounded-xl border border-border px-4 py-3">
                <p className="font-medium">{a.title}</p>
                <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{a.body}</p>
              </li>
            ))}
            {!schoolAnnouncements?.length ? (
              <li className="text-sm text-muted">No school announcements.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </Container>
  );
}
