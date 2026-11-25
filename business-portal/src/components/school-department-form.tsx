"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function SchoolDepartmentForm({ institutionId }: { institutionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("departments").insert({
      institution_id: institutionId,
      name: String(form.get("name") || "").trim(),
    });
    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Field label="New department">
          <Input name="name" required placeholder="Computer Science" />
        </Field>
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Adding…" : "Add"}
      </Button>
      {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
    </form>
  );
}
