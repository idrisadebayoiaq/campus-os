"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocationPicker, type PickedPlace } from "@/components/location-picker";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type Partner = { id: string; name: string; type: string; level: string; endorsed: boolean };

export function PartnerList({ institutionId, userId, partners }: { institutionId: string; userId: string; partners: Partner[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(p: Partner) {
    setBusy(p.id);
    const supabase = createClient();
    const res = p.endorsed
      ? await supabase.from("school_endorsements").delete().eq("institution_id", institutionId).eq("business_id", p.id)
      : await supabase.from("school_endorsements").insert({ institution_id: institutionId, business_id: p.id, endorsed_by: userId });
    setError(res.error ? res.error.message : null);
    setBusy(null);
    router.refresh();
  }

  if (!partners.length) {
    return <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">No businesses are on your campuses yet.</p>;
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="divide-y divide-border rounded-md border border-border">
        {partners.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">
                {p.name}
                {p.endorsed ? <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-on-accent">School-approved</span> : null}
              </p>
              <p className="text-muted">
                {p.type} · {p.level}
              </p>
            </div>
            <Button type="button" variant={p.endorsed ? "secondary" : "primary"} className="!h-9 !px-4" disabled={busy === p.id} onClick={() => toggle(p)}>
              {p.endorsed ? "Remove approval" : "Approve as partner"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export type PointRow = {
  id: string;
  campus_id: string;
  campus: string;
  name: string;
  is_active: boolean;
  lat: number | null;
  lng: number | null;
};

export type CampusOption = { id: string; name: string; lat: number | null; lng: number | null };

export function PickupPointManager({ campuses, points }: { campuses: CampusOption[]; points: PointRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [campusId, setCampusId] = useState(campuses[0]?.id ?? "");
  const [pin, setPin] = useState<PickedPlace | null>(null);
  const [pinKey, setPinKey] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [editPin, setEditPin] = useState<PickedPlace | null>(null);

  const campus = campuses.find((c) => c.id === campusId);
  const bias = campus?.lat != null && campus?.lng != null ? { lat: Number(campus.lat), lng: Number(campus.lng) } : null;

  async function add(form: FormData) {
    const supabase = createClient();
    const { error: e } = await supabase.from("pickup_points").insert({
      campus_id: campusId,
      name: String(form.get("name")).trim(),
      lat: pin?.lat ?? null,
      lng: pin?.lng ?? null,
    });
    setError(e ? (e.message.includes("duplicate") ? "That point already exists." : e.message) : null);
    if (!e) {
      setPin(null);
      setPinKey((k) => k + 1);
    }
    router.refresh();
  }

  async function patch(id: string, values: { is_active?: boolean; lat?: number; lng?: number }) {
    const supabase = createClient();
    const { error: e } = await supabase.from("pickup_points").update(values).eq("id", id);
    setError(e ? e.message : null);
    router.refresh();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("pickup_points").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <form
        className="space-y-3 rounded-2xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          e.currentTarget.reset();
          void add(form);
        }}
      >
        <h3 className="font-medium">Add a pickup point</h3>
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <select
            value={campusId}
            onChange={(e) => setCampusId(e.target.value)}
            required
            className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm"
          >
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input name="name" placeholder="e.g. Faculty of Science gate" required />
        </div>
        <LocationPicker
          key={`${campusId}-${pinKey}`}
          names={{ address: "pin_address", lat: "pin_lat", lng: "pin_lng" }}
          bias={bias}
          addressLabel="Where is it?"
          addressHint="Search or drag the map so the pin sits on the exact meeting spot. Students see the walking distance to it."
          onChange={setPin}
        />
        <Button type="submit" disabled={!pin}>
          Add point
        </Button>
        {!pin ? <p className="text-xs text-muted">Place the pin first.</p> : null}
      </form>

      <div className="divide-y divide-border rounded-md border border-border">
        {points.map((p) => (
          <div key={p.id} className="space-y-3 px-4 py-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className={p.is_active ? "" : "text-muted line-through"}>
                {p.name} <span className="text-muted">· {p.campus}</span>
                {p.lat == null ? (
                  <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs text-muted">No pin yet</span>
                ) : null}
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => {
                    setEditPin(null);
                    setEditing(editing === p.id ? null : p.id);
                  }}
                >
                  {p.lat == null ? "Set pin" : "Move pin"}
                </button>
                <button type="button" className="text-xs underline" onClick={() => patch(p.id, { is_active: !p.is_active })}>
                  {p.is_active ? "Hide" : "Show"}
                </button>
                <button type="button" className="text-xs text-red-600" onClick={() => remove(p.id)}>
                  Delete
                </button>
              </span>
            </div>
            {editing === p.id ? (
              <div className="space-y-3">
                <LocationPicker
                  names={{ address: `edit_address_${p.id}`, lat: `edit_lat_${p.id}`, lng: `edit_lng_${p.id}` }}
                  defaultValue={p.lat != null && p.lng != null ? { lat: Number(p.lat), lng: Number(p.lng), label: p.name } : null}
                  bias={
                    campuses.find((c) => c.id === p.campus_id)?.lat != null
                      ? {
                          lat: Number(campuses.find((c) => c.id === p.campus_id)!.lat),
                          lng: Number(campuses.find((c) => c.id === p.campus_id)!.lng),
                        }
                      : null
                  }
                  addressLabel="Where is it?"
                  onChange={setEditPin}
                />
                <Button
                  type="button"
                  disabled={!editPin}
                  onClick={async () => {
                    if (!editPin) return;
                    await patch(p.id, { lat: editPin.lat, lng: editPin.lng });
                    setEditing(null);
                  }}
                >
                  Save pin
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}