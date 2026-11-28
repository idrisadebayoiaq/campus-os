"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field } from "@/components/ui";

const LEVELS = ["100", "200", "300", "400", "500", "600"];
const selectClass = "h-11 w-full rounded-2xl border border-border bg-bg px-3 text-sm";

export function ClassSettingsForm({
  classId,
  departmentId,
  level,
  autoEnroll,
  joinApproval,
  departments,
}: {
  classId: string;
  departmentId: string | null;
  level: string | null;
  autoEnroll: boolean;
  joinApproval: boolean;
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    const form = new FormData(event.currentTarget);
    const { error: err } = await createClient()
      .from("class_offerings")
      .update({
        department_id: String(form.get("department_id") || "") || null,
        level: String(form.get("level") || "") || null,
        auto_enroll: form.get("auto_enroll") === "on",
        join_approval: form.get("join_approval") === "on",
        updated_at: new Date().toISOString(),
      })
      .eq("id", classId);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setOk("Saved. Matching students are added automatically.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border p-4">
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
          <select name="level" defaultValue={level ?? ""} className={selectClass}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l} level
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="auto_enroll" defaultChecked={autoEnroll} />
        Add students in this department and level automatically
      </label>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="join_approval" defaultChecked={joinApproval} />
        Approve students who join with the code
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-success">{ok}</p> : null}
      <Button type="submit" variant="secondary" disabled={loading}>
        {loading ? "Saving…" : "Save class settings"}
      </Button>
    </form>
  );
}
