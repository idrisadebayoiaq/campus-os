"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { VerifiedBadge } from "@/components/live-tables";

export type RequestRow = {
  id: string;
  status: string;
  message: string | null;
  preferred_at: string | null;
  created_at: string;
  student_id: string;
  provider_note: string | null;
  property_units:
    | { title: string; properties: { id: string; title: string; business_id: string } | { id: string; title: string; business_id: string }[] }
    | { title: string; properties: { id: string; title: string; business_id: string } | { id: string; title: string; business_id: string }[] }[]
    | null;
};

export type OpenSlot = { id: string; property_id: string; starts_at: string; spots: number };
export type OfferRow = {
  id: string;
  inspection_id: string;
  status: string;
  amount: number;
  rent_period: string | null;
  created_at: string;
};

const PERIODS = [
  { value: "year", label: "per year" },
  { value: "session", label: "per session" },
  { value: "semester", label: "per semester" },
  { value: "month", label: "per month" },
];

const OFFER_STATUS: Record<string, string> = {
  pending: "Waiting for the student to pay",
  paid: "Paid. The student is moving in.",
  declined: "The student chose not to take it",
  cancelled: "Withdrawn or expired",
  refunded: "Refunded",
};
type Student = { name: string; verified: boolean };

const LABEL: Record<string, string> = {
  requested: "New request",
  accepted: "Accepted",
  declined: "Declined",
  rescheduled: "Rescheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function InspectionBoard({
  requests,
  students,
  slots,
  offers = [],
}: {
  requests: RequestRow[];
  students: Record<string, Student>;
  slots: OpenSlot[];
  offers?: OfferRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState<Record<string, { amount: string; period: string; start: string }>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [slotId, setSlotId] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});

  async function updateStatus(id: string, status: string) {
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase
      .from("inspection_requests")
      .update({ status, provider_note: note[id]?.trim() || null })
      .eq("id", id);
    if (e) setError(e.message);
    else router.refresh();
  }

  async function sendOffer(id: string) {
    const f = offerForm[id];
    const amount = Number(f?.amount);
    if (!amount || amount <= 0) {
      setError("Enter the rent amount.");
      return;
    }
    setSending(id);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("create_housing_offer", {
      p_inspection: id,
      p_amount: amount,
      p_period: f?.period || "year",
      p_start: f?.start || null,
    });
    setSending(null);
    if (e) setError(e.message);
    else router.refresh();
  }

  async function withdrawOffer(offerId: string) {
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("cancel_payment_request", { p_request: offerId });
    if (e) setError(e.message);
    else router.refresh();
  }

  async function reschedule(id: string) {
    if (!slotId) return;
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("reschedule_inspection", {
      p_request: id,
      p_slot: slotId,
      p_note: note[id]?.trim() || null,
    });
    if (e) {
      setError(e.message);
      return;
    }
    setMoving(null);
    setSlotId("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="divide-y divide-border rounded-md border border-border">
        {requests.map((req) => {
          const unit = Array.isArray(req.property_units) ? req.property_units[0] : req.property_units;
          const property = Array.isArray(unit?.properties) ? unit?.properties[0] : unit?.properties;
          const student = students[req.student_id];
          const open = req.status === "requested" || req.status === "rescheduled" || req.status === "accepted";
          const options = slots.filter((s) => s.property_id === property?.id);
          return (
            <div key={req.id} className="space-y-3 px-4 py-4 text-sm">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {student?.name || "Student"}
                  <VerifiedBadge verified={Boolean(student?.verified)} />
                </p>
                <p className="mt-0.5">
                  {property?.title} · {unit?.title}
                </p>
                <p className="text-muted">
                  {LABEL[req.status] ?? req.status} ·{" "}
                  {req.preferred_at ? when(req.preferred_at) : "No time chosen"}
                </p>
                {req.message ? <p className="mt-1 text-muted">{req.message}</p> : null}
              </div>

              {req.status === "completed" ? (
                (() => {
                  const mineOffers = offers.filter((o) => o.inspection_id === req.id);
                  const current = mineOffers[0];
                  const f = offerForm[req.id] ?? { amount: "", period: "year", start: "" };
                  const set = (patch: Partial<typeof f>) => setOfferForm((s) => ({ ...s, [req.id]: { ...f, ...patch } }));
                  return (
                    <div className="space-y-2 rounded-md border border-border p-3">
                      {current ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p>
                            <span className="font-medium">
                              Offer ₦{Number(current.amount).toLocaleString()}
                              {current.rent_period ? ` per ${current.rent_period}` : ""}
                            </span>{" "}
                            <span className="text-muted">· {OFFER_STATUS[current.status] ?? current.status}</span>
                          </p>
                          {current.status === "pending" ? (
                            <Button type="button" variant="ghost" onClick={() => withdrawOffer(current.id)}>
                              Withdraw offer
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      {!current || ["declined", "cancelled", "refunded"].includes(current.status) ? (
                        <div className="space-y-2">
                          <p className="text-muted">
                            Send the student an offer for this room. They pay from their wallet and move in. The platform percentage is taken off and the rest goes to your balance.
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={f.amount}
                              onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, "") })}
                              inputMode="decimal"
                              placeholder="Rent amount (₦)"
                              aria-label="Rent amount"
                              className="h-11 w-44 rounded-full border border-border bg-bg px-4 text-sm outline-none focus:border-accent"
                            />
                            <select
                              value={f.period}
                              onChange={(e) => set({ period: e.target.value })}
                              aria-label="Rent period"
                              className="h-11 rounded-full border border-border bg-bg px-3 text-sm"
                            >
                              {PERIODS.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            <label className="flex items-center gap-2 text-muted">
                              Move-in
                              <input
                                type="date"
                                value={f.start}
                                onChange={(e) => set({ start: e.target.value })}
                                className="h-11 rounded-full border border-border bg-bg px-3 text-sm text-fg"
                              />
                            </label>
                            <Button type="button" disabled={sending === req.id} onClick={() => sendOffer(req.id)}>
                              {sending === req.id ? "Sending…" : "Send offer"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })()
              ) : null}

              {open ? (
                <div className="space-y-2">
                  <input
                    value={note[req.id] ?? ""}
                    onChange={(e) => setNote((n) => ({ ...n, [req.id]: e.target.value }))}
                    placeholder="Optional note to the student (meeting point, what to bring)"
                    className="h-10 w-full rounded-2xl border border-border bg-bg px-3 text-sm outline-none focus:border-accent"
                  />
                  <div className="flex flex-wrap gap-2">
                    {req.status !== "accepted" ? (
                      <Button type="button" onClick={() => updateStatus(req.id, "accepted")}>
                        Accept
                      </Button>
                    ) : (
                      <Button type="button" onClick={() => updateStatus(req.id, "completed")}>
                        Mark completed
                      </Button>
                    )}
                    <Button type="button" variant="secondary" onClick={() => setMoving(moving === req.id ? null : req.id)}>
                      Reschedule
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => updateStatus(req.id, "declined")}>
                      Decline
                    </Button>
                    {req.status === "accepted" ? (
                      <Button type="button" variant="ghost" onClick={() => updateStatus(req.id, "no_show")}>
                        No-show
                      </Button>
                    ) : null}
                  </div>
                  {moving === req.id ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
                      {options.length ? (
                        <>
                          <select
                            value={slotId}
                            onChange={(e) => setSlotId(e.target.value)}
                            className="h-11 rounded-full border border-border bg-bg px-3 text-sm"
                          >
                            <option value="">Choose a new time…</option>
                            {options.map((s) => (
                              <option key={s.id} value={s.id}>
                                {when(s.starts_at)} ({s.spots} left)
                              </option>
                            ))}
                          </select>
                          <Button type="button" disabled={!slotId} onClick={() => reschedule(req.id)}>
                            Move to this time
                          </Button>
                        </>
                      ) : (
                        <p className="text-muted">
                          No open times for this property. Add some on the property page first.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
