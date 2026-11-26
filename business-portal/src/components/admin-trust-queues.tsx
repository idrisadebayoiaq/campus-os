"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type VerificationItem = {
  id: string;
  business: string;
  cac_number: string;
  created_at: string;
  document_url: string | null;
};

export function VerificationQueue({ items }: { items: VerificationItem[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("decide_verification", { p_request: id, p_approve: approve, p_note: notes[id] ?? null });
    setError(e ? e.message : null);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="divide-y divide-border rounded-md border border-border">
        {items.map((i) => (
          <div key={i.id} className="space-y-3 px-4 py-4 text-sm">
            <div>
              <p className="font-medium">{i.business}</p>
              <p className="text-muted">
                CAC {i.cac_number} · sent {new Date(i.created_at).toLocaleDateString()}
              </p>
              {i.document_url ? (
                <a href={i.document_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Open certificate
                </a>
              ) : (
                <p className="text-muted">Document unavailable</p>
              )}
            </div>
            <input
              value={notes[i.id] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [i.id]: e.target.value }))}
              placeholder="Note to the business (optional)"
              className="h-10 w-full rounded-2xl border border-border bg-bg px-3 outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <Button type="button" disabled={busy === i.id} onClick={() => decide(i.id, true)}>
                Approve CAC badge
              </Button>
              <Button type="button" variant="secondary" disabled={busy === i.id} onClick={() => decide(i.id, false)}>
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export type BoostItem = { id: string; business: string; target: string; days: number; amount: number; status: string; created_at: string };

export function BoostQueue({ items }: { items: BoostItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function activate(id: string) {
    setBusy(id);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("staff_activate_boost", { p_boost: id });
    setError(e ? e.message : null);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="divide-y divide-border rounded-md border border-border">
        {items.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">
                {b.target} <span className="text-muted">· {b.business}</span>
              </p>
              <p className="text-muted">
                {b.days} days · ₦{Number(b.amount).toLocaleString()} · {b.status} · {new Date(b.created_at).toLocaleDateString()}
              </p>
            </div>
            {b.status === "pending" ? (
              <Button type="button" className="!h-9 !px-4" disabled={busy === b.id} onClick={() => activate(b.id)}>
                Activate (paid offline)
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
