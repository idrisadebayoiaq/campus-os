"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type SettingRow = { key: string; value: unknown; description: string | null };

const LABELS: Record<string, string> = {
  wallet_enabled: "Student wallet switched on",
  food_commission_pct: "Food order commission (%)",
  rent_commission_pct: "Rent, deposit and agent fee commission (%)",
  marketplace_commission_pct: "Marketplace commission (%)",
  topup_min: "Smallest top-up (₦)",
  topup_max: "Largest top-up (₦)",
  wallet_cap: "Most a wallet can hold (₦)",
  payout_min: "Smallest withdrawal (₦)",
  business_plan_price: "Business plan per month (₦)",
  student_plan_price: "Premium per month, students in school (₦)",
  exam_plan_price: "Premium per month, exam candidates (₦)",
  tutor_free_per_hour: "AI tutor questions per hour, free in-school students",
  tutor_free_per_day: "AI tutor questions per day, free in-school students",
  tutor_premium_multiplier: "AI tutor limit multiplier for in-school Premium (x)",
  tutor_exam_per_hour: "AI tutor questions per hour, exam Premium",
  tutor_exam_per_day: "AI tutor questions per day, exam Premium",
  paystack_fee_percent: "Paystack fee (%)",
  paystack_fee_flat: "Paystack flat fee (₦)",
  paystack_fee_threshold: "Flat fee applies from (₦)",
  paystack_fee_cap: "Paystack fee cap (₦)",
  market_accept_hours: "Seller must accept within (hours)",
  market_handover_days: "Handover must finish within (days)",
  market_release_hours: "Auto-release after seller proof (hours)",
  market_min: "Smallest marketplace order (₦)",
};

export function PaymentSettings({ rows, canEdit }: { rows: SettingRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save(key: string, value: unknown) {
    setBusy(key);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.from("platform_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    setBusy(null);
    setMessage(error ? error.message : "Saved.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-border rounded-md border border-border text-sm">
        {rows.map((r) => (
          <form
            key={r.key}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(new FormData(e.currentTarget).get("value"));
              if (Number.isFinite(n) && n >= 0) void save(r.key, n);
            }}
          >
            <span>{LABELS[r.key] ?? r.key}</span>
            {typeof r.value === "boolean" ? (
              <Button type="button" variant="secondary" className="!h-9 !px-4" disabled={!canEdit || busy === r.key} onClick={() => void save(r.key, !r.value)}>
                {r.value ? "On, tap to switch off" : "Off, tap to switch on"}
              </Button>
            ) : (
              <span className="flex items-center gap-2">
                <Input name="value" type="number" step="any" min={0} defaultValue={String(r.value)} className="!h-9 w-32" disabled={!canEdit} />
                {canEdit ? (
                  <Button type="submit" className="!h-9 !px-4" disabled={busy === r.key}>
                    Save
                  </Button>
                ) : null}
              </span>
            )}
          </form>
        ))}
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}

export function PaystackStatus() {
  const [state, setState] = useState<{ mode: string | null; configured: boolean; balances: { balance: number; currency: string }[] | null; error?: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const status = await supabase.functions.invoke("paystack", { body: { action: "status" } });
      const bal = await supabase.functions.invoke("paystack", { body: { action: "platform-balance" } });
      setState({
        mode: (status.data?.mode as string | null) ?? null,
        configured: Boolean(status.data?.configured),
        balances: (bal.data?.balances as { balance: number; currency: string }[] | undefined) ?? null,
        error: bal.error ? "Could not read the Paystack balance. Check that transfers are enabled for this key." : undefined,
      });
    })();
  }, []);

  if (!state) return <p className="text-sm text-muted">Checking Paystack…</p>;
  if (!state.configured) return <p className="text-sm text-red-600">Paystack key is not set. Add PAYSTACK_SECRET_KEY to the edge function secrets.</p>;
  return (
    <div className="space-y-1 rounded-2xl border border-border bg-surface p-4 text-sm">
      <p>
        Paystack is connected in{" "}
        <span className={`font-semibold ${state.mode === "live" ? "" : "text-amber-600"}`}>{state.mode === "live" ? "LIVE mode (real money)" : "TEST mode (no real money)"}</span>.
      </p>
      {state.balances?.length ? (
        <p className="text-muted">
          Paystack balance available for withdrawals:{" "}
          {state.balances.map((b) => `${b.currency} ${(Number(b.balance) / 100).toLocaleString()}`).join(" · ")}
        </p>
      ) : (
        <p className="text-muted">{state.error ?? "No balance returned."}</p>
      )}
    </div>
  );
}
