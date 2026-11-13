"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Task = {
  id: string;
  title: string;
  course_code: string | null;
  due_at: string | null;
  is_done: boolean;
  description: string | null;
};

type CourseOpt = { id: string; code: string };

export function TasksPanel({ tasks, courses }: { tasks: Task[]; courses: CourseOpt[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function toggleDone(id: string, is_done: boolean) {
    const supabase = createClient();
    await supabase.from("academic_tasks").update({ is_done }).eq("id", id);
    router.refresh();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const courseId = String(form.get("course_id") || "") || null;
    const course = courses.find((c) => c.id === courseId);

    const { error } = await supabase.from("academic_tasks").insert({
      user_id: user.id,
      title: String(form.get("title")),
      course_id: courseId,
      course_code: course?.code || String(form.get("course_code") || "") || null,
      description: String(form.get("description") || "") || null,
      due_at: String(form.get("due_at") || "") || null,
    });

    setStatus(error ? error.message : "Task added.");
    if (!error) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-md border border-border">
        {tasks.length ? (
          tasks.map((task) => (
            <div key={task.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className={task.is_done ? "text-muted line-through" : "font-medium"}>
                  {task.title}
                </p>
                <p className="text-muted">
                  {task.course_code || "General"}
                  {task.due_at ? ` · due ${new Date(task.due_at).toLocaleString()}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => toggleDone(task.id, !task.is_done)}
              >
                {task.is_done ? "Mark pending" : "Mark done"}
              </Button>
            </div>
          ))
        ) : (
          <p className="px-4 py-6 text-sm text-muted">No assignments yet.</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
        <Field label="Title">
          <Input name="title" required placeholder="Lab report" />
        </Field>
        <Field label="Due">
          <Input name="due_at" type="datetime-local" />
        </Field>
        <Field label="Course">
          <select name="course_id" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
            <option value="">None</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Course code (if no link)">
          <Input name="course_code" placeholder="CSC 201" />
        </Field>
        <Field label="Notes">
          <Input name="description" className="sm:col-span-2" placeholder="Brief details" />
        </Field>
        <Button type="submit">Add assignment</Button>
        {status ? <p className="text-sm text-muted sm:col-span-2">{status}</p> : null}
      </form>
    </div>
  );
}
