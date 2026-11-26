"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

async function callPaystack(body: Record<string, unknown>) {
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

  async function save(form: FormData) {
    setBusy(true);
    setMessage(null);
    const res = await callPaystack({
      action: "verify-bank",
      business_id: businessId,
      bank_code: String(form.get("bank_code")),
      account_number: String(form.get("account_number")),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.message });
      return;
    }
    setMessage({ ok: true, text: `Verified: ${res.data.account_name}. Card payments now go straight to this account.` });
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
            void save(new FormData(e.currentTarget));
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
            {busy ? "Checking…" : current?.is_verified ? "Change account" : "Verify & save"}
          </Button>
        </form>
      )}
      {message ? <p className={`text-sm ${message.ok ? "text-muted" : "text-red-600"}`}>{message.text}</p> : null}
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
