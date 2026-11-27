"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { PhotoPicker } from "@/components/photo-picker";
import { createClient } from "@/lib/supabase/client";
import { uploadNewMedia } from "@/lib/listing-media";
import { Button, Field, Input } from "@/components/ui";

export function MarketForm({
  businessId,
  campusId,
  sellerUserId,
  pickupPoints,
  isCommercial,
  defaultKind,
}: {
  businessId: string;
  campusId: string;
  sellerUserId: string;
  pickupPoints: { id: string; name: string }[];
  isCommercial: boolean;
  defaultKind: "goods" | "service";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { data: created, error: insertError } = await supabase.from("marketplace_listings").insert({
      business_id: businessId,
      seller_user_id: sellerUserId,
      campus_id: campusId,
      kind: String(form.get("kind")),
      title: String(form.get("title")),
      description: String(form.get("description") || "") || null,
      price: Number(form.get("price") || 0) || null,
      category: String(form.get("category")),
      condition: String(form.get("condition") || "") || null,
      pickup_point_id: String(form.get("pickup_point") || "") || null,
      is_commercial: isCommercial,
      status: "active",
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).select("id").single();
    if (insertError || !created) {
      setLoading(false);
      setError(insertError?.message || "Could not publish the listing.");
      return;
    }

    if (files.length) {
      const result = await uploadNewMedia(
        sellerUserId,
        { column: "market_listing_id", id: created.id },
        files,
      );
      if (result.errors.length) {
        setError(
          `Listing published, but ${result.errors.length} file${result.errors.length === 1 ? "" : "s"} did not upload (${result.errors[0]}). You can add them on the next page.`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
    setLoading(false);
    router.push(`/listings/market/${created.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PhotoPicker
        files={files}
        onChange={setFiles}
        title="Photos and videos"
        hint="the first photo is the cover students see"
        disabled={loading}
      />
      <Field label="Kind">
        <select name="kind" defaultValue={defaultKind} className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
          <option value="goods">Goods</option>
          <option value="service">Service</option>
        </select>
      </Field>
      <Field label="Title"><Input name="title" required /></Field>
      <Field label="Category"><Input name="category" required placeholder="food / books / repairs (food is paid out as soon as it is handed over)" /></Field>
      <Field label="Price (₦)"><Input name="price" type="number" /></Field>
      <Field label="Condition"><Input name="condition" placeholder="used / new" /></Field>
      {pickupPoints.length ? (
        <Field label="Campus pickup point">
          <select name="pickup_point" defaultValue="" className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
            <option value="">No fixed spot, agree in chat</option>
            {pickupPoints.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Description">
        <textarea name="description" rows={3} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? (files.length ? "Publishing and uploading…" : "Publishing…") : "Publish listing"}
      </Button>
    </form>
  );
}
