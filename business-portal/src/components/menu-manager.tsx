"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";

export type MenuOption = { id: string; group_id: string; name: string; price_delta: number; in_stock: boolean };
export type MenuGroup = {
  id: string;
  menu_item_id: string;
  name: string;
  required: boolean;
  multi: boolean;
  menu_options: MenuOption[];
};
export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  in_stock: boolean;
  is_published: boolean;
  prep_minutes: number | null;
  menu_option_groups: MenuGroup[];
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-border"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg shadow transition-all ${on ? "left-[1.35rem]" : "left-0.5"}`} />
    </button>
  );
}

export function MenuManager({ items }: { items: MenuItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [price, setPrice] = useState<Record<string, string>>({});

  const categories = [...new Set(items.map((i) => i.category || "Meals"))];

  async function patch(id: string, values: Record<string, unknown>) {
    const supabase = createClient();
    const { error } = await supabase.from("menu_items").update(values).eq("id", id);
    setMessage(error ? error.message : null);
    router.refresh();
  }

  async function addGroup(itemId: string, form: FormData) {
    const supabase = createClient();
    const { error } = await supabase.from("menu_option_groups").insert({
      menu_item_id: itemId,
      name: String(form.get("name")).trim(),
      required: form.get("required") === "on",
      multi: form.get("multi") === "on",
    });
    setMessage(error ? error.message : null);
    router.refresh();
  }

  async function removeGroup(id: string) {
    const supabase = createClient();
    await supabase.from("menu_option_groups").delete().eq("id", id);
    router.refresh();
  }

  async function addOption(groupId: string, form: FormData) {
    const supabase = createClient();
    const { error } = await supabase.from("menu_options").insert({
      group_id: groupId,
      name: String(form.get("name")).trim(),
      price_delta: Number(form.get("price_delta") || 0),
    });
    setMessage(error ? error.message : null);
    router.refresh();
  }

  async function patchOption(id: string, values: Record<string, unknown>) {
    const supabase = createClient();
    await supabase.from("menu_options").update(values).eq("id", id);
    router.refresh();
  }

  async function removeOption(id: string) {
    const supabase = createClient();
    await supabase.from("menu_options").delete().eq("id", id);
    router.refresh();
  }

  async function removeItem(item: MenuItem) {
    if (!window.confirm(`Delete ${item.name}? Past orders keep their details.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("menu_items").delete().eq("id", item.id);
    setMessage(error ? "This dish is on past orders, so hide it instead." : null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
      {categories.map((cat) => (
        <section key={cat} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{cat}</h2>
          <div className="divide-y divide-border rounded-md border border-border">
            {items
              .filter((i) => (i.category || "Meals") === cat)
              .map((item) => {
                const expanded = open === item.id;
                return (
                  <div key={item.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`font-medium ${item.is_published ? "" : "text-muted line-through"}`}>{item.name}</p>
                        <p className="text-muted">
                          {item.in_stock ? "In stock" : "Sold out"}
                          {item.menu_option_groups.length
                            ? ` · ${item.menu_option_groups.length} option group${item.menu_option_groups.length === 1 ? "" : "s"}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1">
                          <span className="text-muted">₦</span>
                          <input
                            value={price[item.id] ?? String(item.price)}
                            onChange={(e) => setPrice((p) => ({ ...p, [item.id]: e.target.value }))}
                            onBlur={() => {
                              const n = Number(price[item.id]);
                              if (price[item.id] !== undefined && n >= 0 && n !== Number(item.price)) void patch(item.id, { price: n });
                            }}
                            inputMode="numeric"
                            className="h-9 w-24 rounded-xl border border-border bg-bg px-2 text-sm outline-none focus:border-accent"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-muted">
                          In stock
                          <Toggle on={item.in_stock} label="In stock" onChange={() => patch(item.id, { in_stock: !item.in_stock })} />
                        </label>
                        <label className="flex items-center gap-2 text-muted">
                          Visible
                          <Toggle on={item.is_published} label="Visible" onChange={() => patch(item.id, { is_published: !item.is_published })} />
                        </label>
                        <Button type="button" variant="secondary" className="!h-9 !px-3.5 text-xs" onClick={() => setOpen(expanded ? null : item.id)}>
                          {expanded ? "Close" : "Options"}
                        </Button>
                        <Link href={`/listings/food/${item.id}`} className="text-xs underline underline-offset-2">
                          Photos
                        </Link>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="mt-3 space-y-4 rounded-md border border-border bg-surface/40 p-3">
                        <p className="text-muted">
                          Sizes and add-ons students pick before adding to the cart, e.g. Size: Small / Large (+₦500).
                        </p>
                        {item.menu_option_groups.map((g) => (
                          <div key={g.id} className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium">
                                {g.name}{" "}
                                <span className="text-xs font-normal text-muted">
                                  {g.required ? "required" : "optional"} · {g.multi ? "pick several" : "pick one"}
                                </span>
                              </p>
                              <button type="button" className="text-xs text-red-600" onClick={() => removeGroup(g.id)}>
                                Remove group
                              </button>
                            </div>
                            {g.menu_options.map((o) => (
                              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 pl-3">
                                <span className={o.in_stock ? "" : "text-muted line-through"}>
                                  {o.name} {Number(o.price_delta) > 0 ? `(+₦${Number(o.price_delta).toLocaleString()})` : ""}
                                </span>
                                <span className="flex items-center gap-3">
                                  <label className="flex items-center gap-2 text-xs text-muted">
                                    In stock
                                    <Toggle on={o.in_stock} label="Option in stock" onChange={() => patchOption(o.id, { in_stock: !o.in_stock })} />
                                  </label>
                                  <button type="button" className="text-xs text-red-600" onClick={() => removeOption(o.id)}>
                                    Remove
                                  </button>
                                </span>
                              </div>
                            ))}
                            <form
                              className="flex flex-wrap gap-2 pl-3"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const form = new FormData(e.currentTarget);
                                e.currentTarget.reset();
                                void addOption(g.id, form);
                              }}
                            >
                              <Input name="name" placeholder="Option name" required className="!h-9 max-w-[12rem]" />
                              <Input name="price_delta" type="number" min={0} placeholder="Extra ₦" className="!h-9 max-w-[7rem]" />
                              <Button type="submit" variant="secondary" className="!h-9 !px-3.5 text-xs">
                                Add option
                              </Button>
                            </form>
                          </div>
                        ))}
                        <form
                          className="flex flex-wrap items-center gap-3 border-t border-border pt-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const form = new FormData(e.currentTarget);
                            e.currentTarget.reset();
                            void addGroup(item.id, form);
                          }}
                        >
                          <Input name="name" placeholder="New group, e.g. Size" required className="!h-9 max-w-[12rem]" />
                          <label className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" name="required" /> Required
                          </label>
                          <label className="flex items-center gap-1.5 text-xs">
                            <input type="checkbox" name="multi" /> Pick several
                          </label>
                          <Button type="submit" className="!h-9 !px-3.5 text-xs">
                            Add group
                          </Button>
                        </form>
                        <button type="button" className="text-xs text-red-600" onClick={() => removeItem(item)}>
                          Delete this dish
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
