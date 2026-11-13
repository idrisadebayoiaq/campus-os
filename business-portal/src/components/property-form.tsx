"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function PropertyForm({
  businessId,
  campusId,
  areas,
}: {
  businessId: string;
  campusId: string;
  areas: { id: string; name: string }[];
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

    const { data: property, error: propError } = await supabase
      .from("properties")
      .insert({
        business_id: businessId,
        campus_id: campusId,
        area_id: String(form.get("area_id") || "") || null,
        title: String(form.get("title")),
        description: String(form.get("description") || "") || null,
        address_public: String(form.get("address_public") || "") || null,
        lat: Number(form.get("lat") || 0) || null,
        lng: Number(form.get("lng") || 0) || null,
        verification_label: "provider_checked",
        is_published: form.get("publish") === "on",
        availability_checked_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (propError || !property) {
      setLoading(false);
      setError(propError?.message || "Could not create property");
      return;
    }

    const amenities = String(form.get("amenities") || "")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    const { error: unitError } = await supabase.from("property_units").insert({
      property_id: property.id,
      unit_type: String(form.get("unit_type")),
      title: String(form.get("unit_title")),
      capacity: Number(form.get("capacity") || 1),
      amenities,
      rent_base: Number(form.get("rent_base") || 0),
      fee_agent: Number(form.get("fee_agent") || 0),
      fee_agreement: Number(form.get("fee_agreement") || 0),
      fee_caution: Number(form.get("fee_caution") || 0),
      fee_service: Number(form.get("fee_service") || 0),
      status: "available",
      is_published: form.get("publish") === "on",
    });

    setLoading(false);
    if (unitError) {
      setError(unitError.message);
      return;
    }
    router.push(`/listings/housing/${property.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Property title">
        <Input name="title" required placeholder="Self contain near Gate Area" />
      </Field>
      <Field label="Area">
        <select name="area_id" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
          <option value="">Select area</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Public address / landmark">
        <Input name="address_public" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Map latitude (approx)">
          <Input name="lat" placeholder="7.7829" />
        </Field>
        <Field label="Map longitude (approx)">
          <Input name="lng" placeholder="4.5418" />
        </Field>
      </div>
      <Field label="Description">
        <textarea name="description" rows={3} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
      </Field>
      <Field label="First unit title">
        <Input name="unit_title" required defaultValue="Room 1" />
      </Field>
      <Field label="Unit type">
        <select name="unit_type" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm" defaultValue="self_contained">
          <option value="room">Room</option>
          <option value="self_contained">Self contained</option>
          <option value="shared_apartment">Shared apartment</option>
          <option value="hostel_bed">Hostel bed</option>
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Base rent (₦)"><Input name="rent_base" type="number" required defaultValue={150000} /></Field>
        <Field label="Agent fee (₦)"><Input name="fee_agent" type="number" defaultValue={10000} /></Field>
        <Field label="Agreement (₦)"><Input name="fee_agreement" type="number" defaultValue={5000} /></Field>
        <Field label="Caution (₦)"><Input name="fee_caution" type="number" defaultValue={20000} /></Field>
        <Field label="Service (₦)"><Input name="fee_service" type="number" defaultValue={0} /></Field>
        <Field label="Capacity"><Input name="capacity" type="number" defaultValue={1} /></Field>
      </div>
      <Field label="Amenities (comma-separated)">
        <Input name="amenities" placeholder="water, prepaid light, kitchen" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="publish" defaultChecked />
        Publish to students on this campus
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Create property + unit"}
      </Button>
    </form>
  );
}
