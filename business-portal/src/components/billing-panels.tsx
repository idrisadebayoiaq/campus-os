"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export async function callPaystack(body: Record<string, unknown>) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("paystack", { body });
  if (error) {
    let message = "Something went wrong. Try again.";
    let code: string | undefined;
    try {
      const j = await (error as unknown as { context: Response }).context.json();
      message = j.error || message;
      code = j.code;
    } catch {
      // keep the default message
    }
    return { ok: false as const, message, code };
  }
  return { ok: true as const, data: data as Record<string, unknown> };
}

export type PayoutAccount = {
  business_id: string;
  account_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  is_verified: boolean;
} | null;

export function PayoutForm({ businessId, current }: { businessId: string; current: PayoutAccount }) {
  const router = useRouter();
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await callPaystack({ action: "banks" });
      if (res.ok) {
        setConfigured(true);
        setBanks((res.data.banks as { name: string; code: string }[]) ?? []);
      } else setConfigured(res.code === "not_configured" ? false : true);
    })();
  }, []);

  const [found, setFound] = useState<{ account_name: string; bank_name: string | null; bank_code: string; account_number: string } | null>(null);

  // Step 1: look the account up so the owner can confirm the name.
  async function check(form: FormData) {
    setBusy(true);
    setMessage(null);
    setFound(null);
    const bank_code = String(form.get("bank_code"));
    const account_number = String(form.get("account_number")).replace(/\D/g, "");
    const res = await callPaystack({ action: "resolve-bank", business_id: businessId, bank_code, account_number });
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.message });
      return;
    }
    setFound({
      account_name: String(res.data.account_name),
      bank_name: (res.data.bank_name as string | null) ?? null,
      bank_code,
      account_number,
    });
  }

  // Step 2: the owner confirmed it is their account.
  async function confirm() {
    if (!found) return;
    setBusy(true);
    const res = await callPaystack({
      action: "verify-bank",
      business_id: businessId,
      bank_code: found.bank_code,
      account_number: found.account_number,
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.message });
      return;
    }
    setFound(null);
    setMessage({ ok: true, text: `Saved: ${res.data.account_name}. Card payments now go straight to this account.` });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {current?.is_verified ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm">
          <span className="font-medium">{current.account_name}</span>
          <span className="text-muted">
            {" "}
            · {current.bank_name} · ••••{current.account_number?.slice(-4)}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted">No payout account yet. Add one so students can pay by card.</p>
      )}
      {configured === false ? (
        <p className="rounded-2xl border border-border p-4 text-sm text-muted">
          Online payments are being switched on by CampusOS. You can add your payout account here once they are live.
        </p>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void check(new FormData(e.currentTarget));
          }}
        >
          <select name="bank_code" required className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm">
            <option value="">{banks.length ? "Choose your bank" : "Loading banks…"}</option>
            {banks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
          <Input name="account_number" inputMode="numeric" maxLength={10} placeholder="10-digit account number" required />
          <Button type="submit" disabled={busy || !banks.length}>
            {busy && !found ? "Checking…" : current?.is_verified ? "Change account" : "Check account"}
          </Button>
        </form>
      )}
      {found ? (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm">
          <p>
            This account belongs to <span className="font-semibold">{found.account_name}</span>
            <span className="text-muted">
              {" "}
              · {found.bank_name} · ••••{found.account_number.slice(-4)}
            </span>
          </p>
          <p className="text-muted">Is this your business account? Your money will be sent here, so make sure the name is right.</p>
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void confirm()}>
              {busy ? "Saving…" : "Yes, use this account"}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setFound(null)}>
              No, change it
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <p className={`text-sm ${message.ok ? "text-muted" : "text-red-600"}`}>{message.text}</p> : null}
    </div>
  );
}

export type PayoutRow = {
  id: string;
  amount: number;
  status: string;
  failure_reason: string | null;
  created_at: string;
};

export function BalancePanel({
  businessId,
  balance,
  minimum,
  hasBank,
  payouts,
}: {
  businessId: string;
  balance: number;
  minimum: number;
  hasBank: boolean;
  payouts: PayoutRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const open = payouts.some((p) => p.status === "requested" || p.status === "processing");
  const canWithdraw = hasBank && !open && balance >= minimum;

  async function withdraw() {
    setBusy(true);
    setMessage(null);
    const res = await callPaystack({ action: "payout", business_id: businessId });
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.message });
    } else {
      setMessage({
        ok: true,
        text: res.data.status === "paid" ? "Sent. The money is on its way to your bank." : "Withdrawal started. It usually reaches your bank within minutes.",
      });
    }
    router.refresh();
  }

  const label: Record<string, string> = { requested: "Starting", processing: "On its way", paid: "Paid", failed: "Failed" };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">CampusOS balance</p>
          <p className="text-2xl font-semibold">₦{balance.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted">
            Money from wallet orders. Card orders are paid to your bank straight away and do not show here.
          </p>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2">
            <Button type="button" disabled={busy} onClick={() => void withdraw()}>
              {busy ? "Sending…" : `Withdraw ₦${balance.toLocaleString()}`}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button type="button" disabled={!canWithdraw} onClick={() => setConfirming(true)}>
            Withdraw
          </Button>
        )}
      </div>
      {!hasBank ? <p className="text-sm text-muted">Add and confirm your bank account below to withdraw.</p> : null}
      {hasBank && balance < minimum && !open ? (
        <p className="text-sm text-muted">You can withdraw once your balance reaches ₦{minimum.toLocaleString()}.</p>
      ) : null}
      {message ? <p className={`text-sm ${message.ok ? "text-muted" : "text-red-600"}`}>{message.text}</p> : null}
      {payouts.length ? (
        <div className="divide-y divide-border rounded-md border border-border text-sm">
          {payouts.map((p) => (
            <div key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
              <span>
                ₦{Number(p.amount).toLocaleString()} <span className="text-muted">· {new Date(p.created_at).toLocaleDateString()}</span>
              </span>
              <span className={p.status === "failed" ? "text-red-600" : "text-muted"}>
                {label[p.status] ?? p.status}
                {p.status === "failed" && p.failure_reason ? ` · ${p.failure_reason}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type RefundRow = {
  id: string;
  amount: number;
  reason: string | null;
  status: string;
  created_at: string;
  order_id: string;
};

export function RefundList({ refunds, isOwner }: { refunds: RefundRow[]; isOwner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("decide_refund", { p_refund: id, p_approve: approve });
    if (e) setError(e.message);
    setBusy(null);
    router.refresh();
  }

  async function process(id: string) {
    setBusy(id);
    setError(null);
    const res = await callPaystack({ action: "refund", refund_id: id });
    if (!res.ok) setError(res.message);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="divide-y divide-border rounded-md border border-border">
        {refunds.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">
                ₦{Number(r.amount).toLocaleString()} <span className="text-muted">· {r.status}</span>
              </p>
              <p className="text-muted">
                {r.reason || "No reason given"} · {new Date(r.created_at).toLocaleDateString()}
              </p>
            </div>
            {isOwner && r.status === "requested" ? (
              <div className="flex gap-2">
                <Button type="button" className="!h-9 !px-4" disabled={busy === r.id} onClick={() => decide(r.id, true)}>
                  Approve
                </Button>
                <Button type="button" variant="secondary" className="!h-9 !px-4" disabled={busy === r.id} onClick={() => decide(r.id, false)}>
                  Decline
                </Button>
              </div>
            ) : null}
            {isOwner && r.status === "approved" ? (
              <Button type="button" className="!h-9 !px-4" disabled={busy === r.id} onClick={() => process(r.id)}>
                Send refund to card
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export type VerificationState = {
  level: string;
  label: string | null;
  pending: boolean;
  lastNote: string | null;
  lastStatus: string | null;
};

const LEVELS: Record<string, string> = {
  basic: "Basic",
  identity: "Owner ID checked",
  cac: "CAC verified",
};

export function VerificationPanel({
  businessId,
  ownerId,
  state,
}: {
  businessId: string;
  ownerId: string;
  state: VerificationState;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(form: FormData) {
    const file = form.get("document") as File | null;
    if (!file || !file.size) {
      setMessage("Choose your CAC certificate.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${ownerId}/cac/${businessId}-${Date.now()}.${ext}`;
    const { error: up } = await supabase.storage.from("application-docs").upload(path, file, { contentType: file.type });
    if (up) {
      setMessage(up.message);
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("verification_requests").insert({
      business_id: businessId,
      cac_number: String(form.get("cac_number")).trim(),
      document_path: path,
      created_by: ownerId,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message.includes("verification_one_pending") ? "A request is already waiting for review." : error.message);
      return;
    }
    setMessage("Sent. CampusOS will review your documents.");
    router.refresh();
  }

  return (
    <div className="space-y-3 text-sm">
      <p>
        Current level: <span className="font-medium">{LEVELS[state.level] ?? state.level}</span>
        {state.label ? <span className="text-muted"> · badge “{state.label}”</span> : null}
      </p>
      {state.lastStatus === "rejected" && state.lastNote ? <p className="text-red-600">Last request declined: {state.lastNote}</p> : null}
      {state.level === "cac" ? null : state.pending ? (
        <p className="text-muted">Your CAC documents are waiting for review.</p>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-[12rem_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(new FormData(e.currentTarget));
          }}
        >
          <Input name="cac_number" placeholder="CAC / RC number" required minLength={4} maxLength={30} />
          <input name="document" type="file" accept="image/*,application/pdf" className="text-sm file:mr-3 file:rounded-full file:border file:border-border file:bg-bg file:px-3 file:py-2" required />
          <Button type="submit" disabled={busy}>
            {busy ? "Uploading…" : "Request CAC badge"}
          </Button>
        </form>
      )}
      {message ? <p className="text-muted">{message}</p> : null}
    </div>
  );
}

export type PlanState = { active: boolean; endsAt: string | null };

export function PlanPanel({
  businessId,
  plan,
  price,
  balance,
}: {
  businessId: string;
  plan: PlanState;
  price: number;
  balance: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function fromBalance() {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("pay_business_plan_from_balance", { p_business: businessId });
    setBusy(false);
    setMessage(error ? error.message : "Plan paid. Thank you.");
    router.refresh();
  }

  async function byCard() {
    setBusy(true);
    setMessage(null);
    const res = await callPaystack({ action: "init-plan", business_id: businessId, callback_url: `${window.location.origin}/billing` });
    setBusy(false);
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    window.location.href = String(res.data.authorization_url);
  }

  return (
    <div className="space-y-3 text-sm">
      <p>
        {plan.active ? (
          <>
            Plan active until <span className="font-medium">{plan.endsAt ? new Date(plan.endsAt).toLocaleDateString() : "further notice"}</span>.
          </>
        ) : (
          <span className="text-muted">No active plan.</span>
        )}{" "}
        <span className="text-muted">₦{price.toLocaleString()} per month.</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || balance < price} onClick={() => void fromBalance()}>
          {plan.active ? "Extend" : "Pay"} from balance
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void byCard()}>
          Pay by card
        </Button>
      </div>
      {balance < price ? <p className="text-muted">Your balance (₦{balance.toLocaleString()}) is below the plan price, so use a card.</p> : null}
      {message ? <p className="text-muted">{message}</p> : null}
    </div>
  );
}

export type RequestRow = {
  id: string;
  student: string;
  kind: string;
  title: string;
  amount: number;
  status: string;
  created_at: string;
};
export type TenancyOption = { id: string; label: string };

const KINDS: [string, string][] = [
  ["rent", "Rent"],
  ["deposit", "Deposit / caution fee"],
  ["agent_fee", "Agent fee"],
  ["agreement_fee", "Agreement fee"],
  ["service_fee", "Service fee"],
  ["other", "Other"],
];

export function PaymentRequestsPanel({
  businessId,
  requests,
  tenancies,
  isOwner,
  housing,
}: {
  businessId: string;
  requests: RequestRow[];
  tenancies: TenancyOption[];
  isOwner: boolean;
  housing: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [tenancy, setTenancy] = useState("");

  async function create(form: FormData) {
    setBusy("new");
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("create_payment_request", {
      p_business: businessId,
      p_email: tenancy ? null : String(form.get("email") ?? ""),
      p_kind: String(form.get("kind")),
      p_title: String(form.get("title")),
      p_amount: Number(form.get("amount")),
      p_due: String(form.get("due") ?? "") || null,
      p_tenancy: tenancy || null,
    });
    setBusy(null);
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: "Request sent. The student can pay it from their wallet." });
    if (!error) router.refresh();
  }

  async function act(id: string, fn: "cancel_payment_request" | "refund_payment_request") {
    setBusy(id);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.rpc(fn, { p_request: id });
    setBusy(null);
    if (error) setMessage({ ok: false, text: error.message });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create(new FormData(e.currentTarget));
        }}
      >
        {housing && tenancies.length ? (
          <select value={tenancy} onChange={(e) => setTenancy(e.target.value)} className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm">
            <option value="">Someone else (use email)</option>
            {tenancies.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        ) : null}
        {!tenancy ? <Input name="email" type="email" placeholder="Student's CampusOS email" required /> : null}
        <select name="kind" className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm" defaultValue={housing ? "rent" : "service_fee"}>
          {KINDS.filter(([k]) => housing || k === "service_fee" || k === "other").map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <Input name="title" placeholder="What is it for? e.g. Rent for 2026/27" required minLength={3} maxLength={120} />
        <Input name="amount" type="number" min={1} step="any" placeholder="Amount (₦)" required />
        <Input name="due" type="date" />
        <Button type="submit" disabled={busy === "new"}>
          {busy === "new" ? "Sending…" : "Send payment request"}
        </Button>
      </form>
      {message ? <p className={`text-sm ${message.ok ? "text-muted" : "text-red-600"}`}>{message.text}</p> : null}
      {requests.length ? (
        <div className="divide-y divide-border rounded-md border border-border text-sm">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">
                  {r.title} <span className="text-muted">· ₦{Number(r.amount).toLocaleString()}</span>
                </p>
                <p className="text-muted">
                  {r.student} · {r.kind.replace("_", " ")} · {new Date(r.created_at).toLocaleDateString()} · {r.status}
                </p>
              </div>
              {r.status === "pending" ? (
                <Button type="button" variant="secondary" className="!h-9 !px-4" disabled={busy === r.id} onClick={() => void act(r.id, "cancel_payment_request")}>
                  Cancel
                </Button>
              ) : null}
              {r.status === "paid" && isOwner ? (
                <Button type="button" variant="secondary" className="!h-9 !px-4" disabled={busy === r.id} onClick={() => void act(r.id, "refund_payment_request")}>
                  Refund to wallet
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No payment requests yet.</p>
      )}
    </div>
  );
}