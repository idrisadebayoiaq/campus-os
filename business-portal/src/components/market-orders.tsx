"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type MarketOrderRow = {
  id: string;
  title: string;
  buyer: string;
  amount: number;
  status: string;
  created_at: string;
  accept_by: string;
  handover_by: string | null;
  release_at: string | null;
  cancel_requested_by: string | null;
  cancel_note: string | null;
  dispute_reason: string | null;
  ruling: string | null;
  ruling_note: string | null;
};

const STATUS: Record<string, string> = {
  awaiting_seller: "Waiting for you to accept",
  accepted: "Accepted, waiting for handover",
  seller_confirmed: "Handover confirmed, waiting for the buyer",
  completed: "Completed, payment released",
  cancelled: "Cancelled and refunded",
  declined: "Declined and refunded",
  expired: "Expired and refunded",
  disputed: "In dispute, CampusOS is reviewing",
  resolved: "Dispute decided",
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export function MarketOrderList({ orders, commissionPct }: { orders: MarketOrderRow[]; commissionPct: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function rpc(id: string, fn: string, args: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc(fn, args);
    setBusy(null);
    if (e) setError(e.message);
    else setOpen(null);
    router.refresh();
  }

  async function upload(orderId: string, file: File) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in again");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${orderId}/${user.id}/${Date.now()}.${ext}`;
    const { error: e } = await supabase.storage.from("market-evidence").upload(path, file, { contentType: file.type });
    if (e) throw new Error(e.message);
    return path;
  }

  async function confirmHandover(o: MarketOrderRow, form: FormData) {
    const file = form.get("photo") as File | null;
    if (!file || !file.size) {
      setError("Add a photo of the handover.");
      return;
    }
    setBusy(o.id);
    setError(null);
    try {
      const path = await upload(o.id, file);
      await rpc(o.id, "market_seller_confirm", { p_order: o.id, p_code: String(form.get("code")), p_photo: path });
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function dispute(o: MarketOrderRow, form: FormData) {
    setBusy(o.id);
    setError(null);
    try {
      const file = form.get("photo") as File | null;
      const path = file && file.size ? await upload(o.id, file) : null;
      await rpc(o.id, "market_open_dispute", { p_order: o.id, p_reason: String(form.get("reason")), p_photo: path });
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  if (!orders.length) return <p className="text-sm text-muted">No paid orders yet. When a student pays for a listing, it shows up here.</p>;

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {orders.map((o) => (
        <div key={o.id} className="space-y-3 rounded-2xl border border-border p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">
                {o.title} <span className="text-muted">· ₦{Number(o.amount).toLocaleString()}</span>
              </p>
              <p className="text-muted">
                {o.buyer} · {when(o.created_at)} · you receive ₦{Math.round(o.amount * (1 - commissionPct / 100)).toLocaleString()} after {commissionPct}% commission
              </p>
            </div>
            <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium">{STATUS[o.status] ?? o.status}</span>
          </div>

          {o.status === "awaiting_seller" ? (
            <div className="space-y-2">
              <p className="text-muted">The money is held by CampusOS. Accept by {when(o.accept_by)} or the buyer is refunded.</p>
              <div className="flex gap-2">
                <Button type="button" className="!h-9 !px-4" disabled={busy === o.id} onClick={() => void rpc(o.id, "market_accept", { p_order: o.id })}>
                  Accept order
                </Button>
                <Button type="button" variant="secondary" className="!h-9 !px-4" disabled={busy === o.id} onClick={() => void rpc(o.id, "market_decline", { p_order: o.id })}>
                  Decline
                </Button>
              </div>
            </div>
          ) : null}

          {o.status === "accepted" ? (
            <div className="space-y-3">
              <p className="text-muted">Meet the buyer by {when(o.handover_by)}. They give you a 6-digit code when they receive the item.</p>
              {o.cancel_requested_by === "buyer" ? (
                <div className="space-y-2 rounded-xl bg-surface p-3">
                  <p>The buyer wants to cancel{o.cancel_note ? `: “${o.cancel_note}”` : "."}</p>
                  <div className="flex gap-2">
                    <Button type="button" className="!h-9 !px-4" disabled={busy === o.id} onClick={() => void rpc(o.id, "market_cancel_respond", { p_order: o.id, p_agree: true })}>
                      Agree and refund
                    </Button>
                    <Button type="button" variant="secondary" className="!h-9 !px-4" disabled={busy === o.id} onClick={() => void rpc(o.id, "market_cancel_respond", { p_order: o.id, p_agree: false })}>
                      Decline
                    </Button>
                  </div>
                </div>
              ) : null}
              {open === `confirm-${o.id}` ? (
                <form
                  className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void confirmHandover(o, new FormData(e.currentTarget));
                  }}
                >
                  <Input name="code" inputMode="numeric" maxLength={6} placeholder="Buyer's 6-digit code" required />
                  <input name="photo" type="file" accept="image/*" className="text-sm file:mr-3 file:rounded-full file:border file:border-border file:bg-bg file:px-3 file:py-2" required />
                  <Button type="submit" className="!h-11" disabled={busy === o.id}>
                    {busy === o.id ? "Sending…" : "Confirm handover"}
                  </Button>
                </form>
              ) : open === `dispute-${o.id}` ? (
                <form
                  className="grid gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void dispute(o, new FormData(e.currentTarget));
                  }}
                >
                  <Input name="reason" placeholder="What went wrong? (at least 10 characters)" required minLength={10} maxLength={1000} />
                  <input name="photo" type="file" accept="image/*" className="text-sm file:mr-3 file:rounded-full file:border file:border-border file:bg-bg file:px-3 file:py-2" />
                  <div className="flex gap-2">
                    <Button type="submit" className="!h-9 !px-4" disabled={busy === o.id}>
                      Send to CampusOS
                    </Button>
                    <Button type="button" variant="secondary" className="!h-9 !px-4" onClick={() => setOpen(null)}>
                      Back
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="!h-9 !px-4" onClick={() => setOpen(`confirm-${o.id}`)}>
                    Enter code and photo
                  </Button>
                  <Button type="button" variant="secondary" className="!h-9 !px-4" disabled={busy === o.id} onClick={() => void rpc(o.id, "market_decline", { p_order: o.id })}>
                    Cancel and refund buyer
                  </Button>
                  <Button type="button" variant="secondary" className="!h-9 !px-4" onClick={() => setOpen(`dispute-${o.id}`)}>
                    Open a dispute
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {o.status === "seller_confirmed" ? (
            <p className="text-muted">
              The buyer can confirm now or open a dispute. If they do nothing, the payment is released to you on {when(o.release_at)}.
            </p>
          ) : null}
          {o.status === "disputed" ? <p className="text-muted">Reason: {o.dispute_reason}</p> : null}
          {o.status === "resolved" ? (
            <p className="text-muted">
              Decision: {o.ruling}
              {o.ruling_note ? ` · ${o.ruling_note}` : ""}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export type DisputeRow = {
  id: string;
  title: string;
  amount: number;
  buyer: string;
  seller: string;
  reason: string | null;
  opened_by: string;
  buyer_photo: string | null;
  seller_photo: string | null;
  cancel_note: string | null;
  opened_at: string | null;
  status: string;
  ruling: string | null;
  ruling_note: string | null;
};

export function DisputeQueue({ rows, urls }: { rows: DisputeRow[]; urls: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rule(row: DisputeRow, form: FormData) {
    setBusy(row.id);
    setError(null);
    const ruling = String(form.get("ruling"));
    const supabase = createClient();
    const { error: e } = await supabase.rpc("market_staff_rule", {
      p_order: row.id,
      p_ruling: ruling,
      p_seller_amount: ruling === "split" ? Number(form.get("seller_amount")) : null,
      p_note: String(form.get("note") ?? ""),
    });
    setBusy(null);
    if (e) setError(e.message);
    router.refresh();
  }

  if (!rows.length) return <p className="text-sm text-muted">No disputes.</p>;

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {rows.map((r) => (
        <div key={r.id} className="space-y-3 rounded-2xl border border-border p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-medium">
              {r.title} <span className="text-muted">· ₦{Number(r.amount).toLocaleString()}</span>
            </p>
            <span className="text-muted">
              {r.buyer} (buyer) vs {r.seller} (seller)
            </span>
          </div>
          <p>
            <span className="text-muted">Opened by {r.opened_by}:</span> {r.reason}
          </p>
          {r.cancel_note ? <p className="text-muted">Buyer’s cancel note: {r.cancel_note}</p> : null}
          <div className="flex flex-wrap gap-4">
            {r.buyer_photo && urls[r.buyer_photo] ? (
              <a href={urls[r.buyer_photo]} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Buyer photo
              </a>
            ) : null}
            {r.seller_photo && urls[r.seller_photo] ? (
              <a href={urls[r.seller_photo]} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Seller photo
              </a>
            ) : null}
          </div>
          {r.status === "disputed" ? (
            <form
              className="grid gap-2 sm:grid-cols-[12rem_10rem_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                void rule(r, new FormData(e.currentTarget));
              }}
            >
              <select name="ruling" className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm" defaultValue="refund">
                <option value="release">Pay the seller</option>
                <option value="refund">Refund the buyer</option>
                <option value="split">Split</option>
              </select>
              <Input name="seller_amount" type="number" step="any" min={1} placeholder="Seller share ₦ (split)" />
              <Input name="note" placeholder="Note both sides will see" maxLength={300} />
              <Button type="submit" disabled={busy === r.id}>
                {busy === r.id ? "Saving…" : "Decide"}
              </Button>
            </form>
          ) : (
            <p className="text-muted">
              Decided: {r.ruling}
              {r.ruling_note ? ` · ${r.ruling_note}` : ""}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
