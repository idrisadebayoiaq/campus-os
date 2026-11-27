"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { PhotoPicker } from "@/components/photo-picker";
import { createClient } from "@/lib/supabase/client";
import { uploadNewMedia } from "@/lib/listing-media";
import { Button, Field, Input } from "@/components/ui";

export function MenuItemForm({ businessId, userId }: { businessId: string; userId: string }) {
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
    const { data: created, error: insertError } = await supabase.from("menu_items").insert({
      business_id: businessId,
      name: String(form.get("name")),
      description: String(form.get("description") || "") || null,
      category: String(form.get("category") || "Meals"),
      price: Number(form.get("price") || 0),
      prep_minutes: Number(form.get("prep_minutes") || 20),
      is_published: true,
      in_stock: true,
    }).select("id").single();
    if (insertError || !created) {
      setLoading(false);
      setError(insertError?.message || "Could not save the menu item.");
      return;
    }

    if (files.length) {
      const result = await uploadNewMedia(userId, { column: "menu_item_id", id: created.id }, files);
      if (result.errors.length) {
        setError(
          `Menu item saved, but ${result.errors.length} file${result.errors.length === 1 ? "" : "s"} did not upload (${result.errors[0]}). You can add them on the next page.`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
    setLoading(false);
    router.push(`/listings/food/${created.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PhotoPicker
        files={files}
        onChange={setFiles}
        title="Photos of the meal"
        hint="the first photo is the cover students see"
        disabled={loading}
      />
      <Field label="Name"><Input name="name" required /></Field>
      <Field label="Category"><Input name="category" defaultValue="Meals" /></Field>
      <Field label="Price (₦)"><Input name="price" type="number" required /></Field>
      <Field label="Prep minutes"><Input name="prep_minutes" type="number" defaultValue={20} /></Field>
      <Field label="Description">
        <textarea name="description" rows={3} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? (files.length ? "Saving and uploading…" : "Saving…") : "Save menu item"}
      </Button>
    </form>
  );
}
