"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type TenancyRow = {
  id: string;
  unit: string;
  student: string;
  rent_amount: number;
  rent_period: string;
  next_due_on: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  checklist: { label: string; done: boolean }[];
  receipts: { id: string; amount: number; paid_on: string; receipt_no: string }[];
};

export type UnitOption = { id: string; label: string; rent: number };

export function TenancyManager({ tenancies, units }: { tenancies: TenancyRow[]; units: UnitOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function create(form: FormData) {
    setBusy("new");
    const supabase = createClient();
    const { error } = await supabase.rpc("create_tenancy", {
      p_unit: String(form.get("unit")),
      p_email: String(form.get("email")).trim(),
      p_start: String(form.get("start")) || null,
      p_end: String(form.get("end")) || null,
      p_rent: Number(form.get("rent")),
      p_period: String(form.get("period")),
      p_next_due: String(form.get("due")) || null,
    });
    setBusy(null);
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: "Tenancy created. The student sees it in My room." });
    router.refresh();
  }

  async function pay(t: TenancyRow) {
    const raw = window.prompt(`Amount received (₦)`, String(t.rent_amount));
    if (!raw) return;
    const method = window.prompt("How was it paid? (transfer, cash, …)", "transfer") ?? "";
    setBusy(t.id);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("record_rent_payment", { p_tenancy: t.id, p_amount: Number(raw), p_method: method, p_note: null });
    setBusy(null);
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: `Recorded. Receipt ${data} sent to the student.` });
    router.refresh();
  }

  async function end(t: TenancyRow) {
    if (!window.confirm(`End ${t.student}'s tenancy for ${t.unit}? The room becomes available.`)) return;
    setBusy(t.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("end_tenancy", { p_tenancy: t.id });
    setBusy(null);
    setMessage(error ? { ok: false, text: error.message } : null);
    router.refresh();
  }

  async function tick(t: TenancyRow, index: number) {
    const next = t.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
    const supabase = createClient();
    await supabase.rpc("set_tenancy_checklist", { p_tenancy: t.id, p_checklist: next });
    router.refresh();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      {message ? <p className={`text-sm ${message.ok ? "text-muted" : "text-red-600"}`}>{message.text}</p> : null}

      {tenancies.length ? (
        <div className="space-y-3">
          {tenancies.map((t) => {
            const overdue = t.status === "active" && t.next_due_on && t.next_due_on < today;
            return (
              <article key={t.id} className="space-y-3 rounded-2xl border border-border p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {t.unit} · {t.student}
                    </p>
                    <p className="text-muted">
                      ₦{Number(t.rent_amount).toLocaleString()} per {t.rent_period} · since {new Date(t.start_date).toLocaleDateString()}
                      {t.next_due_on && t.status === "active" ? ` · next due ${new Date(t.next_due_on).toLocaleDateString()}` : ""}
                    </p>
                    <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${overdue ? "bg-red-500/10 text-red-600" : "border border-border text-muted"}`}>
                      {overdue ? "Rent overdue" : t.status}
                    </p>
                  </div>
                  {t.status === "active" || t.status === "upcoming" ? (
                    <div className="flex gap-2">
                      <Button type="button" className="!h-9 !px-4" disabled={busy === t.id} onClick={() => pay(t)}>
                        Record rent paid
                      </Button>
                      <Button type="button" variant="secondary" className="!h-9 !px-4" disabled={busy === t.id} onClick={() => end(t)}>
                        End tenancy
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Move-in checklist</p>
                    <ul className="space-y-1">
                      {t.checklist.map((c, i) => (
                        <li key={c.label}>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={c.done} onChange={() => tick(t, i)} /> <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Receipts</p>
                    {t.receipts.length ? (
                      <ul className="space-y-1 text-muted">
                        {t.receipts.map((r) => (
                          <li key={r.id}>
                            {r.receipt_no} · ₦{Number(r.amount).toLocaleString()} · {new Date(r.paid_on).toLocaleDateString()}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted">None yet.</p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No tenants yet. Add one when a student pays and moves in.
        </p>
      )}

      <form
        className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void create(form);
        }}
      >
        <h2 className="font-medium sm:col-span-2">Add a tenant</h2>
        <select name="unit" required className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm sm:col-span-2">
          <option value="">Choose the room</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
        <Input name="email" type="email" placeholder="Student's CampusOS email" required className="sm:col-span-2" />
        <Input name="rent" type="number" min="0" placeholder="Rent (₦)" required />
        <select name="period" className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm" defaultValue="year">
          <option value="year">per year</option>
          <option value="term">per term</option>
          <option value="quarter">per quarter</option>
          <option value="month">per month</option>
        </select>
        <label className="space-y-1 text-xs text-muted">
          Move-in date
          <Input name="start" type="date" defaultValue={today} />
        </label>
        <label className="space-y-1 text-xs text-muted">
          Next rent due (optional)
          <Input name="due" type="date" />
        </label>
        <label className="space-y-1 text-xs text-muted sm:col-span-2">
          Tenancy ends (optional)
          <Input name="end" type="date" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy === "new"}>
            Create tenancy
          </Button>
        </div>
      </form>
    </div>
  );
}
