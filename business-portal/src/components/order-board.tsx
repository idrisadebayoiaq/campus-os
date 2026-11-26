"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { VerifiedBadge } from "@/components/live-tables";

export type Order = {
  id: string;
  status: string;
  total: number;
  notes: string | null;
  created_at: string;
  prep_minutes: number | null;
  decline_reason: string | null;
  student_id: string;
  fulfilment: string;
  delivery_address: string | null;
  delivery_fee: number;
  discount: number;
  promo_code: string | null;
  payment_method: string;
  payment_status: string;
  food_order_items:
    | { name: string; quantity: number; unit_price: number; options: { group: string; name: string }[] | null }[]
    | null;
};

type Student = { name: string; verified: boolean };

const TABS = [
  { key: "new", label: "New", statuses: ["placed"] },
  { key: "kitchen", label: "In the kitchen", statuses: ["accepted", "preparing"] },
  { key: "ready", label: "Ready", statuses: ["ready"] },
  { key: "done", label: "History", statuses: ["collected", "completed", "declined", "cancelled", "payment_failed", "expired"] },
] as const;

const PREP_CHOICES = [10, 15, 20, 30, 45, 60];
const REASONS = ["Out of stock", "Kitchen is too busy", "Closing soon", "Can't deliver to that spot"];

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
}

const LABEL: Record<string, string> = {
  placed: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  collected: "Collected",
  completed: "Completed",
  declined: "Rejected",
  cancelled: "Cancelled by student",
};

function PaymentTag({ order }: { order: Order }) {
  const label =
    order.payment_status === "paid"
      ? "Paid by card"
      : order.payment_status === "pending"
        ? "Awaiting card payment"
        : order.payment_status === "refund_requested"
          ? "Refund requested"
          : order.payment_status === "refunded"
            ? "Refunded"
            : order.payment_status === "failed"
              ? "Payment failed"
              : order.payment_method === "cash"
                ? "Pay on collection"
                : "Unpaid";
  const good = order.payment_status === "paid";
  return (
    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${good ? "bg-accent text-on-accent" : "border border-border text-muted"}`}>
      {label}
    </span>
  );
}

export function OrderBoard({
  orders,
  students,
}: {
  orders: Order[];
  students: Record<string, Student>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("new");
  const [error, setError] = useState<string | null>(null);
  const [prep, setPrep] = useState<Record<string, number>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const counts = Object.fromEntries(
    TABS.map((t) => [t.key, orders.filter((o) => (t.statuses as readonly string[]).includes(o.status)).length]),
  );
  const visible = orders.filter((o) =>
    (TABS.find((t) => t.key === tab)!.statuses as readonly string[]).includes(o.status),
  );

  async function update(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.from("food_orders").update(patch).eq("id", id);
    setBusy(null);
    if (e) setError(e.message);
    else router.refresh();
  }

  async function reject(id: string) {
    await update(id, { status: "declined", decline_reason: reason.trim() || null });
    setRejecting(null);
    setReason("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm transition ${
              tab === t.key ? "bg-accent text-on-accent" : "border border-border hover:bg-surface"
            }`}
          >
            {t.label}
            <span className={`text-xs ${tab === t.key ? "opacity-80" : "text-muted"}`}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!visible.length ? (
        <p className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted">
          Nothing here right now.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {visible.map((order) => {
            const student = students[order.student_id];
            return (
              <div key={order.id} className="space-y-3 px-4 py-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {student?.name || "Student"}
                      <VerifiedBadge verified={Boolean(student?.verified)} />
                    </p>
                    <p className="text-muted">
                      {LABEL[order.status] ?? order.status} · {ago(order.created_at)}
                      {order.prep_minutes && order.status !== "placed" ? ` · ~${order.prep_minutes} min` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">₦{Number(order.total).toLocaleString()}</p>
                    <PaymentTag order={order} />
                  </div>
                </div>
                <p className="text-muted">
                  {order.fulfilment === "delivery" ? (
                    <>
                      <span className="font-medium text-fg">Delivery</span> to {order.delivery_address}
                      {Number(order.delivery_fee) > 0 ? ` (fee ₦${Number(order.delivery_fee).toLocaleString()})` : ""}
                    </>
                  ) : (
                    <span className="font-medium text-fg">Pickup</span>
                  )}
                  {Number(order.discount) > 0
                    ? ` · ${order.promo_code} −₦${Number(order.discount).toLocaleString()}`
                    : ""}
                </p>

                <ul className="text-muted">
                  {(order.food_order_items || []).map((item, i) => (
                    <li key={`${order.id}-${i}`}>
                      {item.quantity}× {item.name}
                      {item.options?.length ? (
                        <span className="text-muted"> ({item.options.map((o) => o.name).join(", ")})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {order.notes ? <p className="text-muted">Note: {order.notes}</p> : null}
                {order.status === "declined" && order.decline_reason ? (
                  <p className="text-muted">Reason: {order.decline_reason}</p>
                ) : null}

                {order.status === "placed" ? (
                  rejecting === order.id ? (
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <p className="font-medium">Why are you rejecting this order?</p>
                      <div className="flex flex-wrap gap-2">
                        {REASONS.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setReason(r)}
                            className={`rounded-full px-3 py-1 text-xs ${
                              reason === r ? "bg-accent text-on-accent" : "border border-border hover:bg-surface"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Or type a reason (the student will see it)"
                        className="h-10 w-full rounded-2xl border border-border bg-bg px-3 text-sm outline-none focus:border-accent"
                      />
                      <div className="flex gap-2">
                        <Button type="button" disabled={busy === order.id} onClick={() => reject(order.id)}>
                          Reject order
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>
                          Back
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-muted">
                        Ready in
                        <select
                          value={prep[order.id] ?? 20}
                          onChange={(e) => setPrep((p) => ({ ...p, [order.id]: Number(e.target.value) }))}
                          className="h-11 rounded-full border border-border bg-bg px-3 text-sm text-fg"
                        >
                          {PREP_CHOICES.map((m) => (
                            <option key={m} value={m}>
                              {m} min
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="button"
                        disabled={busy === order.id || (order.payment_method === "card" && order.payment_status === "pending")}
                        onClick={() => update(order.id, { status: "accepted", prep_minutes: prep[order.id] ?? 20 })}
                      >
                        {order.payment_method === "card" && order.payment_status === "pending" ? "Waiting for payment" : "Accept"}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setRejecting(order.id)}>
                        Reject
                      </Button>
                    </div>
                  )
                ) : null}

                {order.status === "accepted" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={busy === order.id} onClick={() => update(order.id, { status: "preparing" })}>
                      Start preparing
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setRejecting(order.id)}>
                      Cancel order
                    </Button>
                  </div>
                ) : null}
                {order.status === "preparing" ? (
                  <Button type="button" disabled={busy === order.id} onClick={() => update(order.id, { status: "ready" })}>
                    {order.fulfilment === "delivery" ? "Out for delivery" : "Mark ready for pickup"}
                  </Button>
                ) : null}
                {order.status === "ready" ? (
                  <Button type="button" disabled={busy === order.id} onClick={() => update(order.id, { status: "completed" })}>
                    {order.fulfilment === "delivery" ? "Delivered" : "Handed to student"}
                  </Button>
                ) : null}
                {(order.status === "accepted" || order.status === "preparing") && rejecting === order.id ? (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for cancelling (the student will see it)"
                      className="h-10 w-full rounded-2xl border border-border bg-bg px-3 text-sm outline-none focus:border-accent"
                    />
                    <div className="flex gap-2">
                      <Button type="button" disabled={busy === order.id} onClick={() => reject(order.id)}>
                        Cancel order
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>
                        Back
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
