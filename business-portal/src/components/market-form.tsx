"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function MarketForm({
  businessId,
  campusId,
  sellerUserId,
  isCommercial,
  defaultKind,
}: {
  businessId: string;
  campusId: string;
  sellerUserId: string;
  isCommercial: boolean;
  defaultKind: "goods" | "service";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("marketplace_listings").insert({
      business_id: businessId,
      seller_user_id: sellerUserId,
      campus_id: campusId,
      kind: String(form.get("kind")),
      title: String(form.get("title")),
      description: String(form.get("description") || "") || null,
      price: Number(form.get("price") || 0) || null,
      category: String(form.get("category")),
      condition: String(form.get("condition") || "") || null,
      is_commercial: isCommercial,
      status: "active",
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    router.push("/listings");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Kind">
        <select name="kind" defaultValue={defaultKind} className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm">
          <option value="goods">Goods</option>
          <option value="service">Service</option>
        </select>
      </Field>
      <Field label="Title"><Input name="title" required /></Field>
      <Field label="Category"><Input name="category" required placeholder="laundry / books / repairs" /></Field>
      <Field label="Price (₦)"><Input name="price" type="number" /></Field>
      <Field label="Condition"><Input name="condition" placeholder="used / new" /></Field>
      <Field label="Description">
        <textarea name="description" rows={3} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit">Publish listing</Button>
    </form>
  );
}
