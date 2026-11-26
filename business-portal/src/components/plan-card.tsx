"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { callPaystack } from "@/components/billing-panels";
import { Button, PremiumBadge } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type PlanCardState = {
  active: boolean;
  endsAt: string | null;
  inGrace: boolean;
  autoRenew: boolean;
  card: { brand: string | null; last4: string | null; exp: string } | null;
};

export const PLAN_BENEFITS: { title: string; body: string }[] = [
  { title: "Send payment requests", body: "Ask students for rent, deposits, agent and service fees. They pay from their CampusOS wallet and you are paid out to your bank." },
  { title: "Green Premium badge", body: "Your name carries the Premium badge across the student app, your listings and your business page, so students trust you faster." },
  { title: "Insights and analytics", body: "See views, saves, chats, enquiries, orders and revenue over time to know what is working." },
  { title: "Team members", body: "Invite managers and staff to run the business with you." },
  { title: "Higher ranking", body: "Premium businesses show above others in student search and lists." },
  { title: "Priority support", body: "Your support tickets are moved to the front of the queue." },
];

function money(n: number) {
  return `₦${n.toLocaleString()}`;
}

function brandName(b: string | null) {
  if (!b) return "Card";
  return b.charAt(0).toUpperCase() + b.slice(1);
}

export function PlanCard({
  businessId,
  businessName,
  price,
  balance,
  state,
  isOwner,
}: {
  businessId: string;
  businessName: string;
  price: number;
  balance: number;
  state: PlanCardState;
  isOwner: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState<"card" | "balance" | "renew" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const checked = useRef(false);

  // Back from the card page: confirm the payment and show the new status.
  useEffect(() => {
    const reference = params.get("reference") || params.get("trxref");
    if (!reference || checked.current) return;
    checked.current = true;
    setChecking(true);
    void (async () => {
      let status = "pending";
      for (let i = 0; i < 6 && status !== "success"; i++) {
        const res = await callPaystack({ action: "verify", reference });
        if (!res.ok) {
          setMessage({ ok: false, text: res.message });
          break;
        }
        status = String(res.data.status);
        if (status === "success") break;
        if (status === "failed" || status === "abandoned") break;
        await new Promise((r) => setTimeout(r, 2500));
      }
      setChecking(false);
      if (status === "success") setMessage({ ok: true, text: "Payment received. Your plan is active." });
      else if (status === "failed" || status === "abandoned") setMessage({ ok: false, text: "The payment did not go through. Nothing was charged. Try again." });
      else setMessage({ ok: true, text: "We are still waiting for your bank. This page will update when it confirms." });
      router.replace("/plan");
      router.refresh();
    })();
  }, [params, router]);

  async function payByCard() {
    setBusy("card");
    setMessage(null);
    const res = await callPaystack({ action: "init-plan", business_id: businessId, callback_url: `${window.location.origin}/plan` });
    if (!res.ok) {
      setBusy(null);
      setMessage({ ok: false, text: res.message });
      return;
    }
    window.location.href = String(res.data.authorization_url);
  }

  async function payFromBalance() {
    setBusy("balance");
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("pay_business_plan_from_balance", { p_business: businessId });
    setBusy(null);
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: "Plan paid from your CampusOS balance." });
    router.refresh();
  }

  async function toggleRenew(on: boolean) {
    setBusy("renew");
    const supabase = createClient();
    const { error } = await supabase.rpc("set_plan_auto_renew", { p_business: businessId, p_on: on });
    setBusy(null);
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: on ? "Automatic renewal is on." : "Automatic renewal is off. Your plan will end on the date below." });
    router.refresh();
  }

  const ends = state.endsAt ? new Date(state.endsAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <div className="space-y-6 rounded-3xl border border-border p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{businessName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">CampusOS Premium Business</h2>
            {state.active ? <PremiumBadge /> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold">{money(price)}</p>
          <p className="text-sm text-muted">per month</p>
        </div>
      </div>

      <div
        className={`rounded-2xl border p-4 text-sm ${
          state.active ? "border-[#16a34a]/40 bg-[#16a34a]/10" : state.inGrace ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-surface"
        }`}
      >
        {state.active ? (
          <>
            <p className="font-semibold">Premium active</p>
            <p className="mt-1 text-muted">
              {state.autoRenew && state.card
                ? `Renews automatically on ${ends} with ${brandName(state.card.brand)} ending ${state.card.last4}.`
                : `Active until ${ends}. It will not renew by itself.`}
            </p>
          </>
        ) : state.inGrace ? (
          <>
            <p className="font-semibold">Your plan ended. Short grace period.</p>
            <p className="mt-1 text-muted">You can still use plan features for a few days. Pay now to keep them.</p>
          </>
        ) : (
          <>
            <p className="font-semibold">Not subscribed</p>
            <p className="mt-1 text-muted">Subscribe to send payment requests and unlock everything below.</p>
          </>
        )}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {PLAN_BENEFITS.map((b) => (
          <li key={b.title} className="flex gap-3 rounded-2xl border border-border p-4">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-white">
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-medium">{b.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{b.body}</span>
            </span>
          </li>
        ))}
      </ul>

      {isOwner ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={busy !== null || checking} onClick={() => void payByCard()}>
              {checking ? "Confirming payment…" : busy === "card" ? "Opening secure checkout…" : state.active ? `Pay ${money(price)} to extend` : `Pay ${money(price)} with card`}
            </Button>
            <Button type="button" variant="secondary" disabled={busy !== null || checking || balance < price} onClick={() => void payFromBalance()}>
              {busy === "balance" ? "Paying…" : `Use CampusOS balance (${money(balance)})`}
            </Button>
          </div>
          <p className="text-xs text-muted">
            You enter your card on Paystack&apos;s secure page (Mastercard, Visa, Verve). CampusOS never sees your card number. Your card is saved for renewal, and you can switch that off any time.
          </p>

          {state.card ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4 text-sm">
              <div>
                <p className="font-medium">
                  {brandName(state.card.brand)} •••• {state.card.last4}
                </p>
                <p className="text-muted">Expires {state.card.exp}</p>
              </div>
              <label className="flex cursor-pointer items-center gap-3">
                <span className="text-muted">{state.autoRenew ? "Renews automatically" : "Auto-renew off"}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={state.autoRenew}
                  disabled={busy !== null}
                  onClick={() => void toggleRenew(!state.autoRenew)}
                  className={`relative h-6 w-11 rounded-full transition ${state.autoRenew ? "bg-[#16a34a]" : "bg-border"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${state.autoRenew ? "left-[1.375rem]" : "left-0.5"}`} />
                </button>
              </label>
            </div>
          ) : state.active ? (
            <p className="text-sm text-muted">No card is saved, so this plan will not renew by itself. Pay again before it ends to keep Premium.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">Only the business owner can pay for or change the plan.</p>
      )}

      {message ? <p className={`text-sm ${message.ok ? "text-muted" : "text-red-600"}`}>{message.text}</p> : null}
    </div>
  );
}
