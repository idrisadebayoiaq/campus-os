"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function MenuItemForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("menu_items").insert({
      business_id: businessId,
      name: String(form.get("name")),
      description: String(form.get("description") || "") || null,
      category: String(form.get("category") || "Meals"),
      price: Number(form.get("price") || 0),
      prep_minutes: Number(form.get("prep_minutes") || 20),
      is_published: true,
      in_stock: true,
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
      <Field label="Name"><Input name="name" required /></Field>
      <Field label="Category"><Input name="category" defaultValue="Meals" /></Field>
      <Field label="Price (₦)"><Input name="price" type="number" required /></Field>
      <Field label="Prep minutes"><Input name="prep_minutes" type="number" defaultValue={20} /></Field>
      <Field label="Description">
        <textarea name="description" rows={3} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit">Save menu item</Button>
    </form>
  );
}
