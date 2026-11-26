"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export type Slot = {
  id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked: number;
};

const LENGTHS = [20, 30, 45, 60];

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SlotManager({ propertyId, slots }: { propertyId: string; slots: Slot[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addSlots(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date"));
    const time = String(form.get("time"));
    const minutes = Number(form.get("minutes") || 30);
    const capacity = Number(form.get("capacity") || 1);
    const weeks = Math.min(12, Math.max(1, Number(form.get("weeks") || 1)));
    const first = new Date(`${date}T${time}`);
    if (Number.isNaN(first.getTime()) || first.getTime() <= Date.now()) {
      setMessage("Pick a time in the future.");
      return;
    }
    const rows = Array.from({ length: weeks }, (_, i) => {
      const start = new Date(first.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      return {
        property_id: propertyId,
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + minutes * 60 * 1000).toISOString(),
        capacity,
      };
    });
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("inspection_slots").insert(rows);
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(weeks > 1 ? `${weeks} weekly slots added.` : "Slot added.");
    event.currentTarget.reset();
    router.refresh();
  }

  async function remove(slot: Slot) {
    if (slot.booked > 0 && !window.confirm("Students have booked this time. Remove it anyway? They keep their request.")) {
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("inspection_slots").delete().eq("id", slot.id);
    setMessage(error ? error.message : "Slot removed.");
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Viewing times</h2>
        <p className="text-sm text-muted">
          Students pick one of these when they ask to view a room, so you stop trading messages about when.
        </p>
      </div>

      {slots.length ? (
        <div className="divide-y divide-border rounded-md border border-border">
          {slots.map((slot) => (
            <div key={slot.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{when(slot.starts_at)}</p>
                <p className="text-muted">
                  {slot.booked} of {slot.capacity} booked
                </p>
              </div>
              <Button type="button" variant="ghost" className="!h-9" onClick={() => remove(slot)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-border px-4 py-6 text-center text-sm text-muted">
          No upcoming times yet. Add some below.
        </p>
      )}

      <form onSubmit={addSlots} className="space-y-3 rounded-md border border-border p-4">
        <h3 className="font-medium">Add viewing times</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date">
            <Input name="date" type="date" required />
          </Field>
          <Field label="Start time">
            <Input name="time" type="time" required defaultValue="10:00" />
          </Field>
          <Field label="Length">
            <select
              name="minutes"
              defaultValue={30}
              className="h-11 w-full rounded-2xl border border-border bg-bg px-3 text-sm"
            >
              {LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </Field>
          <Field label="Students per time">
            <Input name="capacity" type="number" min={1} max={20} defaultValue={1} />
          </Field>
          <Field label="Repeat weekly for">
            <select
              name="weeks"
              defaultValue={1}
              className="h-11 w-full rounded-2xl border border-border bg-bg px-3 text-sm"
            >
              {[1, 2, 4, 8, 12].map((w) => (
                <option key={w} value={w}>
                  {w === 1 ? "Just this day" : `${w} weeks`}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button type="submit" disabled={busy}>
          Add times
        </Button>
      </form>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </section>
  );
}
