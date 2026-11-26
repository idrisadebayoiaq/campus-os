"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type Zone = {
  id: string;
  label: string;
  radius_km: number;
  fee: number;
  min_order: number;
  is_active: boolean;
};

export function DeliveryManager({
  businessId,
  hasLocation,
  zones,
}: {
  businessId: string;
  hasLocation: boolean;
  zones: Zone[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function add(form: FormData) {
    const supabase = createClient();
    const { error: err } = await supabase.from("delivery_zones").insert({
      business_id: businessId,
      label: String(form.get("label")).trim(),
      radius_km: Number(form.get("radius_km")),
      fee: Number(form.get("fee") || 0),
      min_order: Number(form.get("min_order") || 0),
    });
    setError(err ? err.message : null);
    router.refresh();
  }

  async function patch(id: string, values: Partial<Zone>) {
    const supabase = createClient();
    const { error: err } = await supabase.from("delivery_zones").update(values).eq("id", id);
    setError(err ? err.message : null);
    router.refresh();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("delivery_zones").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {!hasLocation ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm">
          Delivery distance is measured from your kitchen. Set your business location in{" "}
          <a href={`/setup/${businessId}`} className="underline">
            business profile
          </a>{" "}
          first.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {zones.length ? (
        <div className="divide-y divide-border rounded-md border border-border">
          {zones.map((z) => (
            <div key={z.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className={`font-medium ${z.is_active ? "" : "text-muted line-through"}`}>{z.label}</p>
                <p className="text-muted">
                  Within {Number(z.radius_km)} km · fee ₦{Number(z.fee).toLocaleString()}
                  {Number(z.min_order) > 0 ? ` · min order ₦${Number(z.min_order).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="secondary" className="!h-9 !px-3.5 text-xs" onClick={() => patch(z.id, { is_active: !z.is_active })}>
                  {z.is_active ? "Pause" : "Resume"}
                </Button>
                <button type="button" className="text-xs text-red-600" onClick={() => remove(z.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No delivery zones yet. Students can only collect from you until you add one.
        </p>
      )}

      <form
        className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          e.currentTarget.reset();
          void add(form);
        }}
      >
        <h2 className="font-medium sm:col-span-2">Add a delivery zone</h2>
        <Input name="label" placeholder="Name, e.g. Inside campus" required />
        <Input name="radius_km" type="number" step="0.1" min="0.1" placeholder="Radius (km)" required />
        <Input name="fee" type="number" min="0" placeholder="Delivery fee (₦)" />
        <Input name="min_order" type="number" min="0" placeholder="Minimum order (₦)" />
        <p className="text-xs text-muted sm:col-span-2">
          Add several rings (e.g. 1 km ₦300, 3 km ₦700). Students get the cheapest ring that covers them.
        </p>
        <div className="sm:col-span-2">
          <Button type="submit">Add zone</Button>
        </div>
      </form>
    </div>
  );
}
