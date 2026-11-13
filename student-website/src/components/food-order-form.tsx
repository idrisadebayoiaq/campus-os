"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatNaira } from "@/lib/campus";
import { Button } from "@/components/ui";

type MenuItem = {
  id: string;
  name: string;
  price: number;
};

export function FoodOrderForm({
  businessId,
  campusId,
  menu,
  loggedIn,
}: {
  businessId: string;
  campusId: string;
  menu: MenuItem[];
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lines = useMemo(
    () =>
      menu
        .map((item) => ({ item, quantity: qty[item.id] || 0 }))
        .filter((line) => line.quantity > 0),
    [menu, qty],
  );

  const subtotal = lines.reduce((sum, line) => sum + Number(line.item.price) * line.quantity, 0);
  const packaging = lines.length ? 200 : 0;
  const total = subtotal + packaging;

  async function placeOrder() {
    if (!loggedIn) {
      router.push(`/login?next=/food/${businessId}`);
      return;
    }
    if (!lines.length) {
      setStatus("Add at least one item.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: order, error } = await supabase
      .from("food_orders")
      .insert({
        business_id: businessId,
        campus_id: campusId,
        student_id: user!.id,
        status: "placed",
        subtotal,
        packaging_fee: packaging,
        total,
        notes: notes || null,
      })
      .select("id")
      .single();

    if (error || !order) {
      setLoading(false);
      setStatus(error?.message || "Could not place order.");
      return;
    }

    const { error: itemsError } = await supabase.from("food_order_items").insert(
      lines.map((line) => ({
        order_id: order.id,
        menu_item_id: line.item.id,
        name: line.item.name,
        unit_price: line.item.price,
        quantity: line.quantity,
      })),
    );

    setLoading(false);
    if (itemsError) {
      setStatus(itemsError.message);
      return;
    }
    setStatus("Order placed for pickup. Track it in Inbox.");
    setQty({});
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-5">
      <h2 className="font-medium">Pickup order</h2>
      <div className="space-y-2">
        {menu.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{item.name}</span>
            <input
              type="number"
              min={0}
              className="h-10 w-20 rounded-md border border-border bg-bg px-2"
              value={qty[item.id] || 0}
              onChange={(e) =>
                setQty((prev) => ({ ...prev, [item.id]: Number(e.target.value) }))
              }
            />
          </div>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notes (optional)"
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
      />
      <p className="text-sm">
        Subtotal {formatNaira(subtotal)} + packaging {formatNaira(packaging)} ={" "}
        <span className="font-medium">{formatNaira(total)}</span>
      </p>
      <Button type="button" onClick={placeOrder} disabled={loading || !menu.length}>
        {loading ? "Placing…" : "Place pickup order"}
      </Button>
      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </div>
  );
}
