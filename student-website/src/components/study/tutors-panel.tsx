"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  id: string;
  user_id: string;
  courses: string[];
  bio: string | null;
  rate_note: string | null;
  is_active: boolean;
};

type RequestRow = {
  id: string;
  tutor_profile_id: string;
  course_code: string | null;
  message: string | null;
  status: string;
  created_at: string;
};

export function TutorsPanel({
  profiles,
  ownProfile,
  requests,
  campusId,
}: {
  profiles: Profile[];
  ownProfile: Profile | null;
  requests: RequestRow[];
  campusId?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const coursesRaw = String(form.get("courses") || "");
    const courses = coursesRaw
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);

    const payload = {
      user_id: user.id,
      campus_id: campusId || null,
      courses,
      bio: String(form.get("bio") || "") || null,
      rate_note: String(form.get("rate_note") || "") || null,
      is_active: true,
    };

    const { error } = ownProfile
      ? await supabase.from("tutor_profiles").update(payload).eq("id", ownProfile.id)
      : await supabase.from("tutor_profiles").insert(payload);

    setStatus(error ? error.message : "Profile saved.");
    if (!error) router.refresh();
  }

  async function sendRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("tutor_requests").insert({
      tutor_profile_id: String(form.get("tutor_profile_id")),
      student_id: user.id,
      course_code: String(form.get("course_code") || "") || null,
      message: String(form.get("message") || "") || null,
    });

    setStatus(error ? error.message : "Request sent.");
    if (!error) {
      e.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="font-medium">Peer tutors on campus</h2>
        <div className="divide-y divide-border rounded-md border border-border">
          {profiles.filter((p) => p.is_active).length ? (
            profiles
              .filter((p) => p.is_active)
              .map((p) => (
                <div key={p.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{p.courses.join(", ") || "General"}</p>
                  <p className="text-muted">{p.bio}</p>
                  {p.rate_note ? <p className="text-xs text-muted">{p.rate_note}</p> : null}
                </div>
              ))
          ) : (
            <p className="px-4 py-6 text-sm text-muted">No tutor profiles yet.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Your tutor profile</h2>
        <form onSubmit={saveProfile} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
          <Field label="Courses (comma-separated)">
            <Input
              name="courses"
              defaultValue={ownProfile?.courses?.join(", ") || ""}
              placeholder="CSC 201, MTH 101"
              className="sm:col-span-2"
            />
          </Field>
          <Field label="Bio">
            <textarea
              name="bio"
              defaultValue={ownProfile?.bio || ""}
              rows={3}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm sm:col-span-2"
            />
          </Field>
          <Field label="Rate / availability note">
            <Input name="rate_note" defaultValue={ownProfile?.rate_note || ""} />
          </Field>
          <Button type="submit">{ownProfile ? "Update profile" : "Create profile"}</Button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Request a session</h2>
        <form onSubmit={sendRequest} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
          <Field label="Tutor">
            <select name="tutor_profile_id" required className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm sm:col-span-2">
              <option value="">Select tutor</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.courses.join(", ") || p.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Course">
            <Input name="course_code" placeholder="CSC 201" />
          </Field>
          <Field label="Message">
            <Input name="message" placeholder="I need help with pointers" className="sm:col-span-2" />
          </Field>
          <Button type="submit">Send request</Button>
        </form>
        <div className="divide-y divide-border rounded-md border border-border">
          {requests.length ? (
            requests.map((r) => (
              <div key={r.id} className="px-4 py-3 text-sm">
                {r.course_code || "General"} · {r.status} · {new Date(r.created_at).toLocaleString()}
              </div>
            ))
          ) : (
            <p className="px-4 py-3 text-sm text-muted">No requests sent yet.</p>
          )}
        </div>
      </section>

      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </div>
  );
}
