"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type Target = { business_id: string; entity_type: string; entity_id: string; label: string };
export type Plan = { id: string; name: string; days: number; price: number };
export type BoostRow = { id: string; label: string; status: string; days: number; amount: number; ends_at: string | null };

async function invoke(body: Record<string, unknown>) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("paystack", { body });
  if (error) {
    let message = "Something went wrong.";
    let code: string | undefined;
    try {
      const j = await (error as unknown as { context: Response }).context.json();
      message = j.error || message;
      code = j.code;
    } catch {
      // keep default
    }
    return { ok: false as const, message, code };
  }
  return { ok: true as const, data: data as Record<string, unknown> };
}

export function BoostManager({ targets, plans, boosts }: { targets: Target[]; plans: Plan[]; boosts: BoostRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [target, setTarget] = useState(targets[0] ? `${targets[0].entity_type}:${targets[0].entity_id}` : "");
  const [plan, setPlan] = useState(plans[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const reference = params.get("reference") || params.get("trxref");
    if (!reference) return;
    void (async () => {
      const res = await invoke({ action: "verify", reference });
      setMessage(res.ok ? (res.data.status === "success" ? "Payment received. Your listing is now featured." : "Payment not completed yet.") : res.message);
      router.replace("/boosts");
      router.refresh();
    })();
  }, [params, router]);

  async function pay(boostId: string) {
    setBusy(boostId);
    const res = await invoke({ action: "init-boost", boost_id: boostId, callback_url: `${window.location.origin}/boosts` });
    setBusy(null);
    if (!res.ok) {
      setMessage(res.code === "not_configured" ? "Online payments are being switched on. Ask CampusOS support to activate this boost." : res.message);
      return;
    }
    if (res.data.activated) {
      router.refresh();
      return;
    }
    window.location.href = String(res.data.authorization_url);
  }

  async function request() {
    const t = targets.find((x) => `${x.entity_type}:${x.entity_id}` === target);
    if (!t || !plan) return;
    setBusy("new");
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("request_boost", {
      p_business: t.business_id,
      p_entity_type: t.entity_type,
      p_entity_id: t.entity_id,
      p_plan: plan,
    });
    setBusy(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    await pay(String(data));
  }

  async function cancel(id: string) {
    const supabase = createClient();
    await supabase.rpc("cancel_boost", { p_boost: id });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {message ? <p className="rounded-2xl border border-border bg-surface p-3 text-sm">{message}</p> : null}

      {targets.length ? (
        <div className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_12rem_auto]">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm">
            {targets.map((t) => (
              <option key={`${t.entity_type}:${t.entity_id}`} value={`${t.entity_type}:${t.entity_id}`}>
                {t.label}
              </option>
            ))}
          </select>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · ₦{Number(p.price).toLocaleString()}
              </option>
            ))}
          </select>
          <Button type="button" disabled={busy === "new"} onClick={request}>
            {busy === "new" ? "Starting…" : "Feature & pay"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">Publish a listing first, then you can feature it here.</p>
      )}

      {boosts.length ? (
        <div className="divide-y divide-border rounded-md border border-border">
          {boosts.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{b.label}</p>
                <p className="text-muted">
                  {b.days} days · ₦{Number(b.amount).toLocaleString()} · {b.status}
                  {b.status === "active" && b.ends_at ? ` until ${new Date(b.ends_at).toLocaleDateString()}` : ""}
                </p>
              </div>
              {b.status === "pending" ? (
                <div className="flex items-center gap-3">
                  <Button type="button" className="!h-9 !px-4" disabled={busy === b.id} onClick={() => pay(b.id)}>
                    Pay now
                  </Button>
                  <button type="button" className="text-xs text-red-600" onClick={() => cancel(b.id)}>
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
