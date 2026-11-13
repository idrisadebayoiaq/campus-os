"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function CourseForm({ campusId }: { campusId?: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("Log in required.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("student_courses").insert({
      user_id: user.id,
      campus_id: campusId || null,
      code: String(form.get("code")).trim().toUpperCase(),
      title: String(form.get("title")).trim(),
      units: Number(form.get("units") || 3),
      semester: String(form.get("semester") || "") || null,
      academic_year: String(form.get("academic_year") || "") || null,
      kind: String(form.get("kind") || "compulsory"),
    });

    setLoading(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("Course added.");
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
      <Field label="Course code">
        <Input name="code" placeholder="CSC 201" required />
      </Field>
      <Field label="Title">
        <Input name="title" placeholder="Data Structures" required />
      </Field>
      <Field label="Units">
        <Input name="units" type="number" step="0.5" defaultValue={3} required />
      </Field>
      <Field label="Semester">
        <Input name="semester" placeholder="Harmattan 2025" />
      </Field>
      <Field label="Academic year">
        <Input name="academic_year" placeholder="2025/2026" />
      </Field>
      <Field label="Kind">
        <select
          name="kind"
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
          defaultValue="compulsory"
        >
          <option value="compulsory">Compulsory</option>
          <option value="elective">Elective</option>
          <option value="general">General</option>
        </select>
      </Field>
      <div className="flex items-end sm:col-span-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : "Add course"}
        </Button>
      </div>
      {status ? <p className="text-sm text-muted sm:col-span-2">{status}</p> : null}
    </form>
  );
}
