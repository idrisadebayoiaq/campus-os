"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

export type PointRow = { id: string; campus_id: string; campus: string; name: string; is_active: boolean };

export function PickupPointManager({ campuses, points }: { campuses: { id: string; name: string }[]; points: PointRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function add(form: FormData) {
    const supabase = createClient();
    const { error: e } = await supabase.from("pickup_points").insert({
      campus_id: String(form.get("campus")),
      name: String(form.get("name")).trim(),
    });
    setError(e ? (e.message.includes("duplicate") ? "That point already exists." : e.message) : null);
    router.refresh();
  }

  async function patch(id: string, values: { is_active: boolean }) {
    const supabase = createClient();
    await supabase.from("pickup_points").update(values).eq("id", id);
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
        className="grid gap-3 sm:grid-cols-[14rem_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          e.currentTarget.reset();
          void add(form);
        }}
      >
        <select name="campus" required className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm">
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Input name="name" placeholder="e.g. Faculty of Science gate" required />
        <Button type="submit">Add point</Button>
      </form>
      <div className="divide-y divide-border rounded-md border border-border">
        {points.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className={p.is_active ? "" : "text-muted line-through"}>
              {p.name} <span className="text-muted">· {p.campus}</span>
            </span>
            <span className="flex items-center gap-3">
              <button type="button" className="text-xs underline" onClick={() => patch(p.id, { is_active: !p.is_active })}>
                {p.is_active ? "Hide" : "Show"}
              </button>
              <button type="button" className="text-xs text-red-600" onClick={() => remove(p.id)}>
                Delete
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
