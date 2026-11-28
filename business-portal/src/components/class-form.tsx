"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

const LEVELS = ["100", "200", "300", "400", "500", "600"];

function joinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const selectClass = "h-11 w-full rounded-2xl border border-border bg-bg px-3 text-sm";

export function ClassForm({
  institutionId,
  departmentId,
  campusId,
  departments = [],
}: {
  institutionId: string;
  departmentId?: string | null;
  campusId?: string | null;
  departments?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      setLoading(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("class_offerings")
      .insert({
        lecturer_user_id: user.id,
        institution_id: institutionId,
        department_id: String(form.get("department_id") || "") || departmentId || null,
        campus_id: campusId || null,
        course_code: String(form.get("course_code") || "").trim().toUpperCase(),
        course_title: String(form.get("course_title") || "").trim(),
        academic_session: String(form.get("academic_session") || "").trim() || null,
        semester: String(form.get("semester") || "").trim() || null,
        level: String(form.get("level") || "") || null,
        auto_enroll: form.get("auto_enroll") === "on",
        join_approval: form.get("join_approval") === "on",
        join_code: joinCode(),
      })
      .select("id")
      .single();

    setLoading(false);
    if (insertError || !data) {
      setError(insertError?.message || "Could not create class");
      return;
    }
    router.push(`/classes/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Course code">
          <Input name="course_code" required placeholder="CSC201" />
        </Field>
        <Field label="Semester">
          <Input name="semester" placeholder="First" />
        </Field>
      </div>
      <Field label="Course title">
        <Input name="course_title" required placeholder="Introduction to Programming" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Department">
          <select name="department_id" defaultValue={departmentId ?? ""} className={selectClass}>
            <option value="">No department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Level">
          <select name="level" defaultValue="" className={selectClass}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l} level
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Academic session">
        <Input name="academic_session" placeholder="2025/2026" />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="auto_enroll" defaultChecked className="mt-1" />
        <span>
          <span className="font-medium">Add students automatically</span>
          <span className="block text-muted">
            Students at your school in this department and level join on their own, now and when they sign up later.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="join_approval" className="mt-1" />
        <span>
          <span className="font-medium">Approve students who join with the code</span>
          <span className="block text-muted">Leave off to let anyone with the code join straight away.</span>
        </span>
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Creating…" : "Create class"}
      </Button>
    </form>
  );
}
