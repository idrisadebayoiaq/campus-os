"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

function joinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function ClassForm({
  institutionId,
  departmentId,
  campusId,
}: {
  institutionId: string;
  departmentId?: string | null;
  campusId?: string | null;
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
        department_id: departmentId || null,
        campus_id: campusId || null,
        course_code: String(form.get("course_code") || "").trim().toUpperCase(),
        course_title: String(form.get("course_title") || "").trim(),
        academic_session: String(form.get("academic_session") || "").trim() || null,
        semester: String(form.get("semester") || "").trim() || null,
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
      <Field label="Academic session">
        <Input name="academic_session" placeholder="2025/2026" />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Creating…" : "Create class"}
      </Button>
    </form>
  );
}
