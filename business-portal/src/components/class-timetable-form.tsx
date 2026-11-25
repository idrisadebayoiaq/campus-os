"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function ClassTimetableForm({ classId }: { classId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("add");
    setError(null);
    setOk(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("class_timetable_slots").insert({
      class_id: classId,
      day_of_week: Number(form.get("day_of_week")),
      start_time: String(form.get("start_time")),
      end_time: String(form.get("end_time")),
      venue: String(form.get("venue") || "").trim() || null,
    });
    setLoading(null);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  async function onSync() {
    setLoading("sync");
    setError(null);
    setOk(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "sync_class_timetable_to_students",
      { p_class_id: classId },
    );
    setLoading(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setOk(`Synced ${data ?? 0} timetable row(s) to enrolled students.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onAdd} className="space-y-3 rounded-xl border border-border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Day">
            <select
              name="day_of_week"
              required
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              defaultValue="1"
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Venue">
            <Input name="venue" placeholder="LT1" />
          </Field>
          <Field label="Start">
            <Input name="start_time" required placeholder="09:00" />
          </Field>
          <Field label="End">
            <Input name="end_time" required placeholder="11:00" />
          </Field>
        </div>
        <Button type="submit" disabled={!!loading}>
          {loading === "add" ? "Adding…" : "Add slot"}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onSync} disabled={!!loading}>
          {loading === "sync" ? "Syncing…" : "Push timetable to students"}
        </Button>
        {ok ? <p className="text-sm text-success">{ok}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
