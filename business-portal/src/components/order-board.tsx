"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { VerifiedBadge } from "@/components/live-tables";

export type Order = {
  id: string;
  business_id: string;
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
  receipt_no?: string | null;
  issue_reported_at?: string | null;
  delivered_by?: string | null;
  food_order_items:
    | {
        name: string;
        quantity: number;
        unit_price: number;
        options: { group: string; name: string }[] | null;
        menu_items: { image_url: string | null } | { image_url: string | null }[] | null;
      }[]
    | null;
};

const STATUS_STRIP: Record<string, string> = {
  placed: "border-l-amber-500",
  accepted: "border-l-sky-500",
  preparing: "border-l-orange-500",
  ready: "border-l-emerald-500",
};

function itemImage(item: NonNullable<Order["food_order_items"]>[number]) {
  const m = item.menu_items;
  return (Array.isArray(m) ? m[0]?.image_url : m?.image_url) ?? null;
}

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
  orders: allOrders,
  students,
  kitchens = [],
}: {
  orders: Order[];
  students: Record<string, Student>;
  kitchens?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [kitchen, setKitchen] = useState<string>("all");
  const orders = kitchen === "all" ? allOrders : allOrders.filter((o) => o.business_id === kitchen);
  const kitchenName = (id: string) => kitchens.find((k) => k.id === id)?.name;
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("new");
  const [error, setError] = useState<string | null>(null);
  const [prep, setPrep] = useState<Record<string, number>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});

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

  // The student shows a 4-digit code on their receipt. It finishes the order (and pays the kitchen).
  async function confirmDelivery(id: string) {
    setBusy(id);
    setError(null);
    const supabase = createClient();
    const { data, error: e } = await supabase.rpc("confirm_food_delivery", { p_order: id, p_code: (codes[id] ?? "").trim() });
    setBusy(null);
    if (e) {
      setError(e.message);
      return;
    }
    const res = data as { ok?: boolean; message?: string } | null;
    if (!res?.ok) {
      setError(res?.message ?? "Could not confirm");
      return;
    }
    setCodes((c) => ({ ...c, [id]: "" }));
    router.refresh();
  }

  async function reject(id: string) {
    await update(id, { status: "declined", decline_reason: reason.trim() || null });
    setRejecting(null);
    setReason("");
  }

  return (
    <div className="space-y-4">
      {kitchens.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {[{ id: "all", name: "All restaurants" }, ...kitchens].map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKitchen(k.id)}
              className={`inline-flex h-8 items-center rounded-full px-3 text-xs transition ${
                kitchen === k.id ? "bg-fg text-bg" : "border border-border text-muted hover:bg-surface"
              }`}
            >
              {k.name}
            </button>
          ))}
        </div>
      ) : null}
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
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((order) => {
            const student = students[order.student_id];
            const waitingMins = Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000);
            const late = order.status === "placed" && waitingMins >= 5;
            return (
              <div
                key={order.id}
                className={`space-y-3 rounded-2xl border border-l-4 border-border bg-surface/40 px-4 py-4 text-sm ${
                  STATUS_STRIP[order.status] ?? "border-l-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      #{order.id.slice(0, 4).toUpperCase()}
                      {kitchenName(order.business_id) ? ` · ${kitchenName(order.business_id)}` : ""}
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                      {student?.name || "Student"}
                      <VerifiedBadge verified={Boolean(student?.verified)} />
                    </p>
                    <p className={late ? "font-medium text-red-500" : "text-muted"}>
                      {LABEL[order.status] ?? order.status} · {ago(order.created_at)}
                      {late ? " · needs a response" : ""}
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

                <ul className="space-y-2">
                  {(order.food_order_items || []).map((item, i) => {
                    const img = itemImage(item);
                    return (
                      <li key={`${order.id}-${i}`} className="flex items-center gap-3">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-lg">
                            🍽
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-fg">
                            {item.quantity}× {item.name}
                          </span>
                          {item.options?.length ? (
                            <span className="block text-xs text-muted">{item.options.map((o) => o.name).join(", ")}</span>
                          ) : null}
                        </span>
                        <span className="text-muted">₦{(Number(item.unit_price) * item.quantity).toLocaleString()}</span>
                      </li>
                    );
                  })}
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
                  <div className="space-y-2">
                    {order.issue_reported_at ? (
                      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                        The student reported a problem with this order. Contact them or enter their code once they have it.
                      </p>
                    ) : null}
                    <p className="text-sm text-muted">
                      {order.fulfilment === "delivery"
                        ? "Ask the student for the 4-digit code on their receipt when you hand over the order."
                        : "Ask the student for the 4-digit code on their receipt."}{" "}
                      They can also confirm in their app.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={codes[order.id] ?? ""}
                        onChange={(e) => setCodes((c) => ({ ...c, [order.id]: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="Code"
                        aria-label="Delivery code"
                        className="h-11 w-28 rounded-full border border-border bg-bg px-4 text-center text-lg tracking-[0.3em] outline-none focus:border-accent"
                      />
                      <Button
                        type="button"
                        disabled={busy === order.id || (codes[order.id] ?? "").length !== 4}
                        onClick={() => confirmDelivery(order.id)}
                      >
                        {order.fulfilment === "delivery" ? "Confirm delivered" : "Confirm handed over"}
                      </Button>
                    </div>
                  </div>
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
