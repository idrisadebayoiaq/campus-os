"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

type Order = {
  id: string;
  status: string;
  total: number;
  notes: string | null;
  created_at: string;
  food_order_items: { name: string; quantity: number; unit_price: number }[] | null;
};

const FLOW = ["placed", "accepted", "preparing", "ready", "collected", "completed"] as const;

export function OrderBoard({ orders }: { orders: Order[] }) {
  const router = useRouter();

  async function advance(order: Order) {
    const idx = FLOW.indexOf(order.status as (typeof FLOW)[number]);
    const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : order.status;
    const supabase = createClient();
    await supabase.from("food_orders").update({ status: next }).eq("id", order.id);
    router.refresh();
  }

  async function decline(id: string) {
    const supabase = createClient();
    await supabase.from("food_orders").update({ status: "declined" }).eq("id", id);
    router.refresh();
  }

  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {orders.map((order) => (
        <div key={order.id} className="space-y-3 px-4 py-4 text-sm">
          <div>
            <p className="font-medium">
              ₦{Number(order.total).toLocaleString()} · {order.status}
            </p>
            <p className="text-muted">{new Date(order.created_at).toLocaleString()}</p>
            <ul className="mt-2 text-muted">
              {(order.food_order_items || []).map((item, i) => (
                <li key={`${order.id}-${i}`}>
                  {item.quantity}× {item.name}
                </li>
              ))}
            </ul>
            {order.notes ? <p className="mt-1 text-muted">Note: {order.notes}</p> : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => advance(order)}>
              Advance status
            </Button>
            <Button type="button" variant="ghost" onClick={() => decline(order.id)}>
              Decline
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
