import type { Ionicons } from "@expo/vector-icons";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TxType = "funding" | "purchase" | "refund" | "sale" | "withdrawal" | "other";

export type Tx = {
  id: string;
  at: string;
  type: TxType;
  title: string;
  subtitle: string;
  amount: number;
  status: "paid" | "failed" | "pending" | null;
  source: "wallet" | "earnings";
};

export const TYPE_FILTERS: { value: "all" | TxType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "funding", label: "Funding" },
  { value: "purchase", label: "Purchases" },
  { value: "refund", label: "Refunds" },
  { value: "sale", label: "Sales" },
  { value: "withdrawal", label: "Withdrawals" },
];

export const TYPE_ICON: Record<TxType, keyof typeof Ionicons.glyphMap> = {
  funding: "arrow-down-circle-outline",
  purchase: "bag-handle-outline",
  refund: "return-down-back-outline",
  sale: "pricetag-outline",
  withdrawal: "arrow-up-circle-outline",
  other: "swap-horizontal-outline",
};

type Row = {
  tx_id: string;
  tx_at: string;
  tx_type: TxType;
  title: string;
  subtitle: string;
  amount: number | string;
  status: Tx["status"];
  source: Tx["source"];
};

export async function loadTransactions(
  supabase: SupabaseClient,
  opts: { type?: string; from?: Date | null; to?: Date | null; limit?: number; offset?: number } = {},
): Promise<{ rows: Tx[]; error: string | null }> {
  const { data, error } = await supabase.rpc("my_transactions", {
    p_type: opts.type && opts.type !== "all" ? opts.type : "all",
    p_from: opts.from ? opts.from.toISOString() : null,
    p_to: opts.to ? opts.to.toISOString() : null,
    p_limit: opts.limit ?? 30,
    p_offset: opts.offset ?? 0,
  });
  if (error) return { rows: [], error: error.message };
  return {
    rows: ((data ?? []) as Row[]).map((r) => ({
      id: r.tx_id,
      at: r.tx_at,
      type: r.tx_type,
      title: r.title,
      subtitle: r.subtitle,
      amount: Number(r.amount),
      status: r.status,
      source: r.source,
    })),
    error: null,
  };
}

export function statusText(tx: Tx) {
  if (tx.status === "pending") return "On its way";
  if (tx.status === "failed") return "Failed";
  return null;
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
