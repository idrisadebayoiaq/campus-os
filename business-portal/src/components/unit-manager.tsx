"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

type Unit = {
  id: string;
  title: string;
  status: string;
  is_published: boolean;
  rent_base: number;
};

const STATES = [
  { value: "available", label: "Available", hint: "Shown to students and can be booked" },
  { value: "reserved", label: "Reserved", hint: "Someone has paid or is holding it; students see it as taken" },
  { value: "occupied", label: "Occupied", hint: "Hidden from students" },
  { value: "paused", label: "Paused", hint: "Hidden for now, e.g. renovation" },
] as const;

export function UnitManager({
  propertyId,
  units,
  isPublished,
}: {
  propertyId: string;
  units: Unit[];
  isPublished: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function toggleProperty() {
    const supabase = createClient();
    const { error } = await supabase
      .from("properties")
      .update({
        is_published: !isPublished,
        availability_checked_at: new Date().toISOString(),
      })
      .eq("id", propertyId);
    setStatus(error ? error.message : "Property visibility updated.");
    router.refresh();
  }

  async function setUnitStatus(unitId: string, next: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("property_units")
      .update({ status: next })
      .eq("id", unitId);
    setStatus(error ? error.message : "Unit updated.");
    router.refresh();
  }

  async function setAllStatus(next: string) {
    const supabase = createClient();
    const { error } = await supabase.from("property_units").update({ status: next }).eq("property_id", propertyId);
    setStatus(error ? error.message : `All units set to ${next}.`);
    router.refresh();
  }

  async function addUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error } = await supabase.from("property_units").insert({
      property_id: propertyId,
      title: String(form.get("title")),
      unit_type: String(form.get("unit_type")),
      rent_base: Number(form.get("rent_base") || 0),
      fee_agent: Number(form.get("fee_agent") || 0),
      fee_agreement: Number(form.get("fee_agreement") || 0),
      fee_caution: Number(form.get("fee_caution") || 0),
      fee_service: Number(form.get("fee_service") || 0),
      status: "available",
      is_published: true,
    });
    setStatus(error ? error.message : "Unit added.");
    if (!error) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <Button type="button" variant="secondary" onClick={toggleProperty}>
        {isPublished ? "Unpublish property" : "Publish property"}
      </Button>

      {units.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Set every unit:</span>
          {STATES.map((s) => (
            <Button key={s.value} type="button" variant="secondary" className="!h-9 !px-3.5 text-xs" onClick={() => setAllStatus(s.value)}>
              {s.label}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="divide-y divide-border rounded-md border border-border">
        {units.map((unit) => (
          <div key={unit.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{unit.title}</p>
              <p className="text-muted">
                ₦{Number(unit.rent_base).toLocaleString()} · {unit.status}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  title={s.hint}
                  onClick={() => setUnitStatus(unit.id, s.value)}
                  className={`h-9 rounded-full px-3.5 text-xs font-medium transition ${
                    unit.status === s.value ? "bg-accent text-on-accent" : "border border-border hover:bg-surface"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={addUnit} className="space-y-3 rounded-md border border-border p-4">
        <h3 className="font-medium">Add unit</h3>
        <Field label="Title"><Input name="title" required /></Field>
        <select name="unit_type" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm" defaultValue="room">
          <option value="room">Room</option>
          <option value="self_contained">Self contained</option>
          <option value="shared_apartment">Shared apartment</option>
          <option value="hostel_bed">Hostel bed</option>
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="rent_base" type="number" placeholder="Rent" required />
          <Input name="fee_agent" type="number" placeholder="Agent" defaultValue={0} />
          <Input name="fee_agreement" type="number" placeholder="Agreement" defaultValue={0} />
          <Input name="fee_caution" type="number" placeholder="Caution" defaultValue={0} />
          <Input name="fee_service" type="number" placeholder="Service" defaultValue={0} />
        </div>
        <Button type="submit">Add unit</Button>
      </form>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </div>
  );
}
