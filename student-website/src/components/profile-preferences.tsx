"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { INTEREST_OPTIONS } from "@/lib/onboarding";
import { Button, Field, Input } from "@/components/ui";

type AnyRow = Record<string, unknown> | null;

export function ProfilePreferences({
  focus,
  student,
  prefs,
  housing,
  notifications,
}: {
  focus: string | null;
  student: AnyRow;
  prefs: AnyRow;
  housing: AnyRow;
  notifications: AnyRow;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [interests, setInterests] = useState<string[]>(
    Array.isArray(prefs?.interests) ? (prefs?.interests as string[]) : [],
  );

  async function saveAcademic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("student_profiles").upsert({
      user_id: user.id,
      academic_level: String(form.get("academic_level") || "") || null,
      department_name: String(form.get("department_name") || "") || null,
      programme_name: String(form.get("programme_name") || "") || null,
      academic_session: String(form.get("academic_session") || "") || null,
      current_semester: String(form.get("current_semester") || "") || null,
      target_cgpa: Number(form.get("target_cgpa") || 0) || null,
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      await markSetup("set_study_goal");
    }
    setLoading(false);
    setStatus(error ? error.message : "Academic profile saved.");
    router.refresh();
  }

  async function saveHousing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("housing_preferences").upsert({
      user_id: user.id,
      housing_status: String(form.get("housing_status") || "") || null,
      max_budget: Number(form.get("max_budget") || 0) || null,
      budget_period: String(form.get("budget_period") || "year"),
      alerts_enabled: form.get("alerts_enabled") === "on",
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      await markSetup("set_housing_budget");
    }
    setLoading(false);
    setStatus(error ? error.message : "Housing preferences saved.");
    router.refresh();
  }

  async function saveInterests() {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("student_preferences").upsert({
      user_id: user.id,
      interests,
      primary_academic_goal: String(
        (document.getElementById("primary_academic_goal") as HTMLInputElement | null)?.value || "",
      ) || null,
      ai_explanation_style: String(
        (document.getElementById("ai_explanation_style") as HTMLSelectElement | null)?.value ||
          "balanced",
      ),
      updated_at: new Date().toISOString(),
    });
    setLoading(false);
    setStatus(error ? error.message : "Preferences saved.");
    router.refresh();
  }

  async function saveNotifications(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: user.id,
      academic_reminders: form.get("academic_reminders") === "on",
      lecture_alerts: form.get("lecture_alerts") === "on",
      examination_alerts: form.get("examination_alerts") === "on",
      housing_alerts: form.get("housing_alerts") === "on",
      food_order_updates: form.get("food_order_updates") === "on",
      marketing_email: form.get("marketing_email") === "on",
      updated_at: new Date().toISOString(),
    });
    setLoading(false);
    setStatus(error ? error.message : "Notification preferences saved.");
    router.refresh();
  }

  async function markSetup(task: string) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("onboarding_progress")
      .select("completed_setup_tasks")
      .eq("user_id", user.id)
      .maybeSingle();
    const completed = Array.from(new Set([...(data?.completed_setup_tasks || []), task]));
    await supabase.from("onboarding_progress").upsert({
      user_id: user.id,
      completed_setup_tasks: completed,
      updated_at: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4" id="study">
        <h2 className="text-lg font-medium">Academic details</h2>
        <form onSubmit={saveAcademic} className="grid gap-3 sm:grid-cols-2">
          <Field label="Level">
            <Input name="academic_level" defaultValue={String(student?.academic_level || "")} />
          </Field>
          <Field label="Department">
            <Input name="department_name" defaultValue={String(student?.department_name || "")} />
          </Field>
          <Field label="Programme">
            <Input name="programme_name" defaultValue={String(student?.programme_name || "")} />
          </Field>
          <Field label="Session">
            <Input name="academic_session" defaultValue={String(student?.academic_session || "")} />
          </Field>
          <Field label="Semester">
            <Input name="current_semester" defaultValue={String(student?.current_semester || "")} />
          </Field>
          <Field label="Target CGPA">
            <Input name="target_cgpa" type="number" step="0.01" defaultValue={String(student?.target_cgpa || "")} />
          </Field>
          <Button type="submit" disabled={loading}>
            Save academic
          </Button>
        </form>
      </section>

      <section className="space-y-4" id="housing">
        <h2 className="text-lg font-medium">Housing preferences</h2>
        <p className="text-sm text-muted">
          If you already have a place, Home hides housing shortcuts. Housing page stays available.
        </p>
        <form onSubmit={saveHousing} className="grid gap-3 sm:grid-cols-2">
          <Field label="Do you already have a hostel/house?">
            <select
              name="housing_status"
              defaultValue={String(housing?.housing_status || "")}
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
            >
              <option value="">Select</option>
              <option value="need_room">No — I need a room</option>
              <option value="moving_soon">Moving soon / looking now</option>
              <option value="housed">Yes — I already have hostel/house</option>
              <option value="exploring">Just exploring options</option>
            </select>
          </Field>
          <Field label="Max budget (₦)">
            <Input name="max_budget" type="number" defaultValue={String(housing?.max_budget || "")} />
          </Field>
          <Field label="Budget period">
            <select
              name="budget_period"
              defaultValue={String(housing?.budget_period || "year")}
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
            >
              <option value="year">Per year</option>
              <option value="semester">Per semester</option>
              <option value="month">Per month</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              name="alerts_enabled"
              type="checkbox"
              defaultChecked={Boolean(housing?.alerts_enabled)}
            />
            Housing alerts
          </label>
          <Button type="submit" disabled={loading}>
            Save housing prefs
          </Button>
        </form>
        {focus === "housing" ? (
          <p className="text-xs text-muted">Opened from dashboard setup card.</p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Interests & study style</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {INTEREST_OPTIONS.map((item) => {
            const selected = interests.includes(item.value);
            return (
              <button
                key={item.value}
                type="button"
                onClick={() =>
                  setInterests((prev) =>
                    prev.includes(item.value)
                      ? prev.filter((v) => v !== item.value)
                      : [...prev, item.value],
                  )
                }
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  selected ? "border-fg bg-surface" : "border-border"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <Field label="Primary academic goal">
          <Input
            id="primary_academic_goal"
            defaultValue={String(prefs?.primary_academic_goal || "")}
            placeholder="Improve CGPA / pass exams / stay organized"
          />
        </Field>
        <Field label="AI explanation style">
          <select
            id="ai_explanation_style"
            defaultValue={String(prefs?.ai_explanation_style || "balanced")}
            className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
          >
            <option value="beginner">Beginner</option>
            <option value="balanced">Balanced</option>
            <option value="detailed">Detailed</option>
            <option value="concise">Concise</option>
            <option value="step">Step-by-step</option>
          </select>
        </Field>
        <Button type="button" onClick={saveInterests} disabled={loading}>
          Save interests
        </Button>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Notifications</h2>
        <form onSubmit={saveNotifications} className="space-y-2 text-sm">
          {[
            ["academic_reminders", "Academic reminders"],
            ["lecture_alerts", "Lecture alerts"],
            ["examination_alerts", "Examination alerts"],
            ["housing_alerts", "Housing alerts"],
            ["food_order_updates", "Food order updates"],
            ["marketing_email", "Marketing email (optional)"],
          ].map(([name, label]) => (
            <label key={name} className="flex items-center gap-2">
              <input
                name={name}
                type="checkbox"
                defaultChecked={
                  notifications ? Boolean(notifications[name] ?? name !== "marketing_email") : name !== "marketing_email"
                }
              />
              {label}
            </label>
          ))}
          <Button type="submit" disabled={loading}>
            Save notifications
          </Button>
        </form>
      </section>

      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </div>
  );
}
