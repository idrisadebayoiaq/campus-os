"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export type Deal = {
  id: string;
  kind: "special" | "discount_code";
  title: string;
  description: string | null;
  code: string | null;
  percent_off: number | null;
  amount_off: number | null;
  menu_item_id: string | null;
  special_price: number | null;
  starts_at: string;
  ends_at: string;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
};

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d;
}

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function DealsManager({
  businessId,
  menu,
  deals,
}: {
  businessId: string;
  menu: { id: string; name: string; price: number }[];
  deals: Deal[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"special" | "discount_code">("special");
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();

  async function add(form: FormData) {
    const supabase = createClient();
    const ends = new Date(String(form.get("ends_at")));
    const base = {
      business_id: businessId,
      kind,
      title: String(form.get("title")).trim(),
      description: String(form.get("description") || "").trim() || null,
      ends_at: ends.toISOString(),
      max_uses: form.get("max_uses") ? Number(form.get("max_uses")) : null,
    };
    const row: Record<string, unknown> =
      kind === "special"
        ? {
            ...base,
            menu_item_id: String(form.get("menu_item_id")),
            special_price: Number(form.get("special_price")),
          }
        : {
            ...base,
            code: String(form.get("code")).trim().toUpperCase(),
            percent_off: form.get("discount_type") === "percent" ? Number(form.get("value")) : null,
            amount_off: form.get("discount_type") === "amount" ? Number(form.get("value")) : null,
          };
    const { error: err } = await supabase.from("promotions").insert(row);
    setError(err ? (err.message.includes("promotions_code_unique") ? "That code is already in use." : err.message) : null);
    router.refresh();
  }

  async function toggle(d: Deal) {
    const supabase = createClient();
    await supabase.from("promotions").update({ is_active: !d.is_active }).eq("id", d.id);
    router.refresh();
  }

  async function remove(d: Deal) {
    const supabase = createClient();
    await supabase.from("promotions").delete().eq("id", d.id);
    router.refresh();
  }

  function status(d: Deal) {
    if (!d.is_active) return "Paused";
    if (new Date(d.ends_at).getTime() < now) return "Ended";
    if (new Date(d.starts_at).getTime() > now) return "Scheduled";
    if (d.max_uses && d.used_count >= d.max_uses) return "Used up";
    return "Live";
  }

  return (
    <div className="space-y-8">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {deals.length ? (
        <div className="divide-y divide-border rounded-md border border-border">
          {deals.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {d.title}{" "}
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-xs ${status(d) === "Live" ? "bg-accent text-on-accent" : "border border-border text-muted"}`}
                  >
                    {status(d)}
                  </span>
                </p>
                <p className="text-muted">
                  {d.kind === "special"
                    ? `Special: ${menu.find((m) => m.id === d.menu_item_id)?.name ?? "dish"} for ₦${Number(d.special_price).toLocaleString()}`
                    : `Code ${d.code}: ${d.percent_off ? `${d.percent_off}% off` : `₦${Number(d.amount_off).toLocaleString()} off`}`}
                  {" · ends "}
                  {new Date(d.ends_at).toLocaleString()}
                  {d.kind === "discount_code" ? ` · used ${d.used_count}${d.max_uses ? `/${d.max_uses}` : ""}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="secondary" className="!h-9 !px-3.5 text-xs" onClick={() => toggle(d)}>
                  {d.is_active ? "Pause" : "Resume"}
                </Button>
                <button type="button" className="text-xs text-red-600" onClick={() => remove(d)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No deals yet. A special pins a dish at a lower price on your menu; a code gives a discount at checkout.
        </p>
      )}

      <form
        className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void add(form);
        }}
      >
        <div className="flex gap-2 sm:col-span-2">
          {(
            [
              ["special", "Today's special"],
              ["discount_code", "Discount code"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${kind === k ? "bg-accent text-on-accent" : "border border-border"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Input name="title" placeholder={kind === "special" ? "e.g. Friday jollof deal" : "e.g. Freshers welcome"} required className="sm:col-span-2" />
        {kind === "special" ? (
          <>
            <select name="menu_item_id" required className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm">
              <option value="">Pick a dish</option>
              {menu.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (₦{Number(m.price).toLocaleString()})
                </option>
              ))}
            </select>
            <Input name="special_price" type="number" min="0" placeholder="Special price (₦)" required />
          </>
        ) : (
          <>
            <Input name="code" placeholder="Code, e.g. FRESHER10" required maxLength={20} />
            <div className="flex gap-2">
              <select name="discount_type" className="h-11 rounded-2xl border border-border bg-bg px-3 text-sm">
                <option value="percent">% off</option>
                <option value="amount">₦ off</option>
              </select>
              <Input name="value" type="number" min="1" placeholder="Value" required />
            </div>
          </>
        )}
        <Input name="description" placeholder="Short note (optional)" className="sm:col-span-2" />
        <label className="space-y-1 text-xs text-muted">
          Ends
          <Input name="ends_at" type="datetime-local" defaultValue={localInput(endOfToday())} required />
        </label>
        <label className="space-y-1 text-xs text-muted">
          Max uses (optional)
          <Input name="max_uses" type="number" min="1" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit">Create deal</Button>
        </div>
      </form>
    </div>
  );
}
