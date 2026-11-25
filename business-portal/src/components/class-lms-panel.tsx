"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

type Enrollment = {
  id: string;
  student_user_id: string;
  name: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ClassLmsPanel({
  classId,
  enrollments,
}: {
  classId: string;
  enrollments: Enrollment[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<
    | "assignments"
    | "live"
    | "attendance"
    | "materials"
    | "grades"
    | "office"
    | "staff"
    | "pastq"
  >("assignments");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});

  const tabs = useMemo(
    () =>
      [
        ["assignments", "Assignments"],
        ["live", "Live class"],
        ["attendance", "Attendance"],
        ["materials", "Materials"],
        ["grades", "Grades"],
        ["office", "Office hours"],
        ["staff", "Co-lecturers"],
        ["pastq", "Past questions"],
      ] as const,
    [],
  );

  function flash(msg: string) {
    setOk(msg);
    setError(null);
    router.refresh();
  }

  async function createAssignment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const due = String(form.get("due_at") || "");
    const { data, error: err } = await supabase
      .from("class_assignments")
      .insert({
        class_id: classId,
        created_by: user!.id,
        title: String(form.get("title") || "").trim(),
        description: String(form.get("description") || "").trim() || null,
        due_at: due ? new Date(due).toISOString() : null,
        max_score: Number(form.get("max_score") || 100) || 100,
      })
      .select("id")
      .single();
    if (err || !data) {
      setLoading(false);
      setError(err?.message || "Failed");
      return;
    }
    await supabase.rpc("push_assignment_to_student_tasks", {
      p_assignment_id: data.id,
    });
    setLoading(false);
    (e.target as HTMLFormElement).reset();
    flash("Assignment published to enrolled students.");
  }

  async function scheduleLive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const scheduled = String(form.get("scheduled_at") || "");
    const room = `campusos-${classId.slice(0, 8)}-${Date.now()}`;
    const mode = String(form.get("mode") || "video");
    const webBase =
      process.env.NEXT_PUBLIC_STUDENT_WEB_URL ||
      "https://campusos-app.vercel.app";
    const joinUrl = `${webBase.replace(/\/$/, "")}/live/${encodeURIComponent(room)}?mode=${mode === "voice" ? "voice" : "video"}`;
    const { error: err } = await supabase.from("class_live_sessions").insert({
      class_id: classId,
      created_by: user!.id,
      title: String(form.get("title") || "").trim(),
      mode,
      scheduled_at: new Date(scheduled).toISOString(),
      status: "scheduled",
      room_name: room,
      notes: String(form.get("notes") || "").trim() || null,
      join_url: joinUrl,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    (e.target as HTMLFormElement).reset();
    flash("Live class scheduled. Students can Join from Classes.");
  }

  async function takeAttendance(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: session, error: sErr } = await supabase
      .from("class_attendance_sessions")
      .insert({
        class_id: classId,
        label: String(form.get("label") || "Class session").trim(),
        created_by: user!.id,
      })
      .select("id")
      .single();
    if (sErr || !session) {
      setLoading(false);
      setError(sErr?.message || "Failed");
      return;
    }
    const rows = enrollments.map((en) => ({
      session_id: session.id,
      student_user_id: en.student_user_id,
      status: attendanceMap[en.student_user_id] || "present",
    }));
    if (rows.length) {
      const { error: rErr } = await supabase.from("class_attendance_records").insert(rows);
      if (rErr) {
        setLoading(false);
        setError(rErr.message);
        return;
      }
    }
    setLoading(false);
    flash("Attendance saved.");
  }

  async function addMaterial(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("class_materials").insert({
      class_id: classId,
      uploaded_by: user!.id,
      title: String(form.get("title") || "").trim(),
      description: String(form.get("description") || "").trim() || null,
      link_url: String(form.get("link_url") || "").trim() || null,
      file_url: String(form.get("file_url") || "").trim() || null,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    (e.target as HTMLFormElement).reset();
    flash("Material added.");
  }

  async function addGrade(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("class_grades").insert({
      class_id: classId,
      student_user_id: String(form.get("student_user_id")),
      label: String(form.get("label") || "").trim(),
      score: Number(form.get("score")),
      max_score: Number(form.get("max_score") || 100),
      recorded_by: user!.id,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    (e.target as HTMLFormElement).reset();
    flash("Grade recorded.");
  }

  async function addOffice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("class_office_hours").insert({
      lecturer_user_id: user!.id,
      class_id: classId,
      day_of_week: Number(form.get("day_of_week")),
      start_time: String(form.get("start_time")),
      end_time: String(form.get("end_time")),
      venue: String(form.get("venue") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    (e.target as HTMLFormElement).reset();
    flash("Office hours added.");
  }

  async function addStaff(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim();
    const supabase = createClient();
    const { data: uid, error: lookupErr } = await supabase.rpc("lookup_user_id_by_email", {
      p_email: email,
    });
    if (lookupErr || !uid) {
      setLoading(false);
      setError(lookupErr?.message || "User not found");
      return;
    }
    const { error: err } = await supabase.from("class_staff").upsert({
      class_id: classId,
      user_id: uid as string,
      role: String(form.get("role") || "ta"),
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    (e.target as HTMLFormElement).reset();
    flash("Staff member added.");
  }

  async function addPastQ(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("class_past_questions").insert({
      class_id: classId,
      uploaded_by: user!.id,
      title: String(form.get("title") || "").trim(),
      year: String(form.get("year") || "").trim() || null,
      file_url: String(form.get("file_url") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    (e.target as HTMLFormElement).reset();
    flash("Past question added.");
  }

  function exportCsv() {
    const header = "student_user_id,name\n";
    const body = enrollments
      .map((e) => `${e.student_user_id},"${(e.name || "").replaceAll('"', '""')}"`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `class-${classId}-roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Teaching tools</h2>
        <Button type="button" variant="secondary" onClick={exportCsv}>
          Export roster CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setOk(null);
              setError(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === id ? "bg-inverse-bg text-inverse-fg" : "border border-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-success">{ok}</p> : null}

      {tab === "assignments" ? (
        <form onSubmit={createAssignment} className="space-y-3 rounded-xl border border-border p-4">
          <Field label="Title">
            <Input name="title" required placeholder="Assignment 1" />
          </Field>
          <Field label="Description">
            <textarea
              name="description"
              rows={3}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Due">
              <Input name="due_at" type="datetime-local" />
            </Field>
            <Field label="Max score">
              <Input name="max_score" type="number" defaultValue={100} />
            </Field>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Publishing…" : "Publish assignment"}
          </Button>
        </form>
      ) : null}

      {tab === "live" ? (
        <form onSubmit={scheduleLive} className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm text-muted">
            Schedules a LiveKit-ready room. Add LiveKit API keys later to generate join tokens.
          </p>
          <Field label="Title">
            <Input name="title" required placeholder="Week 4 live tutorial" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mode">
              <select
                name="mode"
                className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
                defaultValue="video"
              >
                <option value="video">Video call</option>
                <option value="voice">Voice only</option>
              </select>
            </Field>
            <Field label="Starts at">
              <Input name="scheduled_at" type="datetime-local" required />
            </Field>
          </div>
          <Field label="Notes">
            <Input name="notes" placeholder="Optional agenda" />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Scheduling…" : "Schedule live class"}
          </Button>
        </form>
      ) : null}

      {tab === "attendance" ? (
        <form onSubmit={takeAttendance} className="space-y-3 rounded-xl border border-border p-4">
          <Field label="Session label">
            <Input name="label" defaultValue="Lecture" />
          </Field>
          <ul className="divide-y divide-border rounded-md border border-border">
            {enrollments.map((en) => (
              <li key={en.student_user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{en.name}</span>
                <select
                  className="h-9 rounded-md border border-border bg-bg px-2 text-sm"
                  value={attendanceMap[en.student_user_id] || "present"}
                  onChange={(ev) =>
                    setAttendanceMap((prev) => ({
                      ...prev,
                      [en.student_user_id]: ev.target.value,
                    }))
                  }
                >
                  {["present", "absent", "late", "excused"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </li>
            ))}
            {!enrollments.length ? (
              <li className="px-3 py-4 text-muted">No students enrolled.</li>
            ) : null}
          </ul>
          <Button type="submit" disabled={loading || !enrollments.length}>
            {loading ? "Saving…" : "Save attendance"}
          </Button>
        </form>
      ) : null}

      {tab === "materials" ? (
        <form onSubmit={addMaterial} className="space-y-3 rounded-xl border border-border p-4">
          <Field label="Title">
            <Input name="title" required />
          </Field>
          <Field label="Description">
            <Input name="description" />
          </Field>
          <Field label="Link URL">
            <Input name="link_url" placeholder="https://…" />
          </Field>
          <Field label="File URL">
            <Input name="file_url" placeholder="https://…/slides.pdf" />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Add material"}
          </Button>
        </form>
      ) : null}

      {tab === "grades" ? (
        <form onSubmit={addGrade} className="space-y-3 rounded-xl border border-border p-4">
          <Field label="Student">
            <select
              name="student_user_id"
              required
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
            >
              <option value="">Select</option>
              {enrollments.map((en) => (
                <option key={en.student_user_id} value={en.student_user_id}>
                  {en.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label">
            <Input name="label" required placeholder="CA1 / Midterm" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Score">
              <Input name="score" type="number" required step="0.01" />
            </Field>
            <Field label="Max">
              <Input name="max_score" type="number" defaultValue={100} />
            </Field>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Record grade"}
          </Button>
        </form>
      ) : null}

      {tab === "office" ? (
        <form onSubmit={addOffice} className="space-y-3 rounded-xl border border-border p-4">
          <Field label="Day">
            <select
              name="day_of_week"
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              defaultValue={1}
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start">
              <Input name="start_time" required placeholder="14:00" />
            </Field>
            <Field label="End">
              <Input name="end_time" required placeholder="16:00" />
            </Field>
          </div>
          <Field label="Venue">
            <Input name="venue" />
          </Field>
          <Field label="Notes">
            <Input name="notes" />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Add office hours"}
          </Button>
        </form>
      ) : null}

      {tab === "staff" ? (
        <form onSubmit={addStaff} className="space-y-3 rounded-xl border border-border p-4">
          <Field label="Co-lecturer / TA email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Role">
            <select
              name="role"
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              defaultValue="ta"
            >
              <option value="ta">Teaching assistant</option>
              <option value="co_lecturer">Co-lecturer</option>
            </select>
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Adding…" : "Add staff"}
          </Button>
        </form>
      ) : null}

      {tab === "pastq" ? (
        <form onSubmit={addPastQ} className="space-y-3 rounded-xl border border-border p-4">
          <Field label="Title">
            <Input name="title" required placeholder="2023 exam paper" />
          </Field>
          <Field label="Year">
            <Input name="year" placeholder="2023" />
          </Field>
          <Field label="File URL">
            <Input name="file_url" placeholder="https://…" />
          </Field>
          <Field label="Notes">
            <Input name="notes" />
          </Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Add past question"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
