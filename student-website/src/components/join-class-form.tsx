"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function JoinClassForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    const form = new FormData(event.currentTarget);
    const code = String(form.get("join_code") || "").trim();
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("join_class_by_code", {
      p_code: code,
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setOk("Joined class. Timetable updates appear after your lecturer syncs slots.");
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border p-4">
      <Field label="Join class with code">
        <Input name="join_code" required placeholder="ABC123" className="uppercase" />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-success">{ok}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Joining…" : "Join class"}
      </Button>
    </form>
  );
}
