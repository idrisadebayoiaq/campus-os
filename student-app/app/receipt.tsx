import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { Empty, Notice, PageShell } from "@/src/components/page";
import { ReceiptCard, receiptText, SuccessBurst, type ReceiptModel } from "@/src/components/receipt";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { notify, toast } from "@/src/lib/feedback";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

type Loaded = {
  model: ReceiptModel;
  /** Set for food orders so the screen can offer the delivery actions. */
  food?: { id: string; status: string; delivery: boolean; issue: boolean };
  burst: { title: string; subtitle?: string };
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const FOOD_STAGE: Record<string, string> = {
  placed: "Waiting for the kitchen",
  accepted: "Accepted",
  preparing: "Being prepared",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  payment_failed: "Payment failed",
};

const MARKET_STAGE: Record<string, string> = {
  awaiting_seller: "Waiting for the seller",
  accepted: "Accepted",
  seller_confirmed: "Ready for handover",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  expired: "Expired",
  disputed: "Under review",
  resolved: "Resolved",
};

const BY_LABEL: Record<string, string> = { restaurant: "the kitchen", student: "you", auto: "CampusOS (automatically)" };

const short = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();
const money = (n: number) => formatNaira(Number(n));

async function loadFood(id: string): Promise<Loaded | null> {
  const [orderRes, codeRes] = await Promise.all([
    supabase
      .from("food_orders")
      .select(
        "id, status, total, subtotal, delivery_fee, discount, promo_code, fulfilment, delivery_address, payment_method, payment_status, created_at, receipt_no, delivered_at, delivered_by, issue_reported_at, business_profiles(display_name), food_order_items(name, quantity, unit_price, options)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("food_order_codes").select("code").eq("order_id", id).maybeSingle(),
  ]);
  const o = orderRes.data as Row | null;
  if (!o) return null;
  const biz = Array.isArray(o.business_profiles) ? o.business_profiles[0] : o.business_profiles;
  const delivery = o.fulfilment === "delivery";
  const dead = ["declined", "cancelled", "expired", "payment_failed"].includes(o.status);
  const refunded = o.payment_status === "refunded" || o.payment_status === "refund_requested";
  const done = o.status === "completed" || o.status === "collected";
  const stage =
    o.status === "ready"
      ? delivery
        ? "On its way"
        : "Ready for pickup"
      : done
        ? delivery
          ? "Delivered"
          : "Picked up"
        : (FOOD_STAGE[o.status] ?? o.status);

  let status: ReceiptModel["status"] = "success";
  let statusLabel = "Payment successful";
  if (dead) {
    status = "failed";
    statusLabel = o.status === "declined" ? "Order declined" : o.status === "cancelled" ? "Order cancelled" : o.status === "expired" ? "Order expired" : "Payment failed";
  } else if (o.payment_status === "pending") {
    status = "pending";
    statusLabel = "Awaiting payment";
  }

  const rows: ReceiptModel["rows"] = [
    { label: "Kitchen", value: biz?.display_name ?? "Kitchen" },
    { label: "Order number", value: o.receipt_no ?? short(o.id) },
    { label: "Paid with", value: o.payment_method === "wallet" ? "CampusOS wallet" : o.payment_method === "card" ? "Card" : "Cash" },
    { label: delivery ? "Delivery" : "Pickup", value: delivery ? "To your address" : "At the kitchen" },
  ];
  if (delivery && o.delivery_address) rows.push({ label: "Address", value: o.delivery_address });
  rows.push({ label: "Order status", value: stage });
  if (dead && refunded) rows.push({ label: "Refund", value: o.payment_status === "refunded" ? "Returned to your wallet" : "Requested" });
  if (done && o.delivered_at) {
    rows.push({
      label: delivery ? "Delivered" : "Picked up",
      value: `${new Date(o.delivered_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}${o.delivered_by ? ` · confirmed by ${BY_LABEL[o.delivered_by] ?? o.delivered_by}` : ""}`,
    });
  }

  const items = ((o.food_order_items ?? []) as Row[]).map((i) => ({
    qty: Number(i.quantity),
    name: String(i.name),
    detail: Array.isArray(i.options) && i.options.length ? i.options.map((x: Row) => x.name).join(", ") : undefined,
    price: Number(i.unit_price) * Number(i.quantity),
  }));

  const totals: NonNullable<ReceiptModel["totals"]> = [{ label: "Subtotal", value: money(o.subtotal) }];
  if (Number(o.delivery_fee) > 0) totals.push({ label: "Delivery fee", value: money(o.delivery_fee) });
  if (Number(o.discount) > 0) totals.push({ label: o.promo_code ? `Discount (${o.promo_code})` : "Discount", value: `-${money(o.discount)}` });
  totals.push({ label: "Total", value: money(o.total), strong: true });

  const live = ["placed", "accepted", "preparing", "ready"].includes(o.status);
  const code = codeRes.data?.code as string | undefined;

  return {
    model: {
      status,
      statusLabel,
      amount: Number(o.total),
      sign: "-",
      title: `Order at ${biz?.display_name ?? "the kitchen"}`,
      subtitle: refunded && dead ? "Your money has been returned." : undefined,
      when: o.created_at,
      rows,
      items,
      totals,
      code:
        live && code
          ? {
              label: delivery ? "Delivery code" : "Pickup code",
              value: code,
              hint: delivery
                ? "Show this to the delivery person when your food arrives. Don't share it before."
                : "Show this at the counter when you collect your order.",
            }
          : undefined,
      reference: o.receipt_no ?? short(o.id),
    },
    food: { id: o.id, status: o.status, delivery, issue: !!o.issue_reported_at },
    burst: { title: "Payment successful", subtitle: delivery ? "Keep your delivery code ready." : "Show your code when you pick up." },
  };
}

async function loadMarket(id: string, userId: string, entry?: Row): Promise<Loaded | null> {
  const { data } = await supabase
    .from("market_orders")
    .select("id, title, amount, status, buyer_id, created_at")
    .eq("id", id)
    .maybeSingle();
  const o = data as Row | null;
  if (!o) return null;
  const buyer = o.buyer_id === userId;
  let code: string | null = null;
  if (buyer && (o.status === "accepted" || o.status === "seller_confirmed")) {
    const res = await supabase.rpc("market_handover_code", { p_order: o.id });
    if (typeof res.data === "string") code = res.data;
  }
  const dead = ["cancelled", "declined", "expired"].includes(o.status);
  const rows: ReceiptModel["rows"] = [
    { label: "Item", value: String(o.title) },
    { label: "Order number", value: `MK-${short(o.id)}` },
    { label: "Paid with", value: "CampusOS wallet" },
    { label: "Order status", value: MARKET_STAGE[o.status] ?? o.status },
  ];
  if (buyer && !code && ["awaiting_seller"].includes(o.status)) rows.push({ label: "Handover code", value: "Appears once the seller accepts" });
  return {
    model: {
      status: dead ? "failed" : "success",
      statusLabel: dead ? (o.status === "declined" ? "Order declined" : o.status === "expired" ? "Order expired" : "Order cancelled") : buyer ? "Payment held safely" : "Sale",
      amount: Number(o.amount),
      sign: buyer ? "-" : "+",
      title: String(o.title),
      subtitle: buyer && !dead ? "CampusOS holds your money until you receive the item." : undefined,
      when: entry?.created_at ?? o.created_at,
      rows,
      code: code ? { label: "Handover code", value: code, hint: "Give this to the seller when you receive your item." } : undefined,
      reference: `MK-${short(o.id)}`,
    },
    burst: { title: "Payment successful", subtitle: "Held safely until you receive the item." },
  };
}

const REQUEST_KIND: Record<string, string> = {
  rent: "Rent",
  deposit: "Deposit",
  agent_fee: "Agent fee",
  agreement_fee: "Agreement fee",
  service_fee: "Service fee",
  other: "Payment",
};

async function loadRequest(id: string): Promise<Loaded | null> {
  const { data } = await supabase
    .from("payment_requests")
    .select("id, kind, title, amount, status, paid_at, created_at, rent_period, start_on, tenancy_id, business_profiles(display_name), property_units(title)")
    .eq("id", id)
    .maybeSingle();
  const r = data as Row | null;
  if (!r) return null;
  const biz = Array.isArray(r.business_profiles) ? r.business_profiles[0] : r.business_profiles;
  const unit = Array.isArray(r.property_units) ? r.property_units[0] : r.property_units;
  let receiptNo: string | null = null;
  if (r.tenancy_id) {
    const { data: rr } = await supabase
      .from("rent_receipts")
      .select("receipt_no")
      .eq("tenancy_id", r.tenancy_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    receiptNo = (rr as Row | null)?.receipt_no ?? null;
  }
  const paid = r.status === "paid";
  const refunded = r.status === "refunded";
  const rows: ReceiptModel["rows"] = [
    { label: "Paid to", value: biz?.display_name ?? "Provider" },
    { label: "Payment for", value: REQUEST_KIND[r.kind] ?? "Payment" },
  ];
  if (unit?.title) rows.push({ label: "Room", value: unit.title });
  if (r.rent_period) rows.push({ label: "Rent period", value: String(r.rent_period) });
  if (r.start_on) rows.push({ label: "Move-in date", value: new Date(r.start_on).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) });
  rows.push({ label: "Paid with", value: "CampusOS wallet" });
  if (receiptNo) rows.push({ label: "Receipt number", value: receiptNo });
  return {
    model: {
      status: paid ? "success" : refunded ? "success" : r.status === "pending" ? "pending" : "failed",
      statusLabel: paid ? "Payment successful" : refunded ? "Refunded" : r.status === "pending" ? "Awaiting payment" : r.status === "declined" ? "Declined" : "Cancelled",
      amount: Number(r.amount),
      sign: paid || refunded ? (refunded ? "+" : "-") : "",
      title: String(r.title),
      when: r.paid_at ?? r.created_at,
      rows,
      reference: receiptNo ?? `RQ-${short(r.id)}`,
    },
    burst: { title: "Payment successful", subtitle: r.kind === "rent" && unit?.title ? "Welcome home. Your move-in checklist is in My apartment." : undefined },
  };
}

async function loadTopup(reference: string): Promise<Loaded | null> {
  const { data } = await supabase
    .from("payment_ledger")
    .select("amount, status, meta, created_at, reference")
    .eq("reference", reference)
    .maybeSingle();
  const p = data as Row | null;
  if (!p) return null;
  const credit = Number(p.meta?.credit ?? p.amount);
  const failed = p.status === "failed";
  const ok = p.status === "success";
  const rows: ReceiptModel["rows"] = [
    { label: "Paid by card", value: money(p.amount) },
    { label: failed ? "Not added" : "Added to wallet", value: money(credit) },
    { label: "Paid with", value: "Card" },
  ];
  if (failed && p.meta?.failure) rows.push({ label: "Reason", value: String(p.meta.failure).replace(/^Reason: /, "").replace(/\.$/, "") });
  return {
    model: {
      status: ok ? "success" : failed ? "failed" : "pending",
      statusLabel: ok ? "Funding successful" : failed ? "Funding failed" : "Processing",
      amount: credit,
      sign: ok ? "+" : "",
      title: "Wallet funding",
      when: p.created_at,
      rows,
      reference: p.reference,
    },
    burst: { title: "Wallet funded", subtitle: "The money is in your wallet." },
  };
}

const WALLET_TITLE: Record<string, string> = {
  topup: "Wallet funding",
  spend: "Payment",
  escrow_hold: "Held for a purchase",
  refund: "Refund",
  subscription: "CampusOS Premium",
};
const WALLET_LABEL: Record<string, string> = {
  topup: "Funding successful",
  spend: "Payment successful",
  escrow_hold: "Payment held safely",
  refund: "Refund received",
  subscription: "Payment successful",
};
const EARN_TITLE: Record<string, string> = {
  sale: "Marketplace sale",
  commission: "CampusOS fee",
  refund: "Sale refunded",
  payout: "Withdrawal",
  payout_reversal: "Withdrawal returned",
  to_wallet: "Moved to wallet",
};

async function loadEntry(txId: string, userId: string): Promise<Loaded | "redirect" | null> {
  const wallet = txId.startsWith("w_");
  const id = txId.slice(2);
  const { data } = await supabase
    .from(wallet ? "wallet_entries" : "user_entries")
    .select(wallet ? "id, kind, amount, balance_after, ref_type, ref_id, reference, note, created_at" : "id, kind, amount, ref_type, ref_id, reference, note, created_at")
    .eq("id", id)
    .maybeSingle();
  const e = data as Row | null;
  if (!e) return null;

  if (wallet && e.ref_type === "food_order" && e.ref_id) {
    router.replace({ pathname: "/receipt", params: { kind: "food", id: String(e.ref_id) } });
    return "redirect";
  }
  if (wallet && e.ref_type === "payment_request" && e.ref_id) {
    router.replace({ pathname: "/receipt", params: { kind: "request", id: String(e.ref_id) } });
    return "redirect";
  }
  if (e.ref_type === "market_order" && e.ref_id) {
    const m = await loadMarket(String(e.ref_id), userId, e);
    if (m) {
      // The money line (held / refunded / sale) is what this row is about.
      m.model.sign = Number(e.amount) < 0 ? "-" : "+";
      m.model.amount = Math.abs(Number(e.amount));
      m.model.statusLabel = wallet ? (WALLET_LABEL[e.kind] ?? "Completed") : (EARN_TITLE[e.kind] ?? "Completed");
      m.model.rows.push({ label: "Reference", value: String(e.reference) });
      return m;
    }
  }

  const amount = Number(e.amount);
  const rows: ReceiptModel["rows"] = [{ label: "Type", value: (wallet ? WALLET_TITLE[e.kind] : EARN_TITLE[e.kind]) ?? "Transaction" }];
  if (e.note) rows.push({ label: "Details", value: String(e.note) });
  if (wallet && e.balance_after != null) rows.push({ label: "Wallet balance after", value: money(e.balance_after) });
  rows.push({ label: wallet ? "Paid with" : "Account", value: wallet ? "CampusOS wallet" : "Earnings" });

  let status: ReceiptModel["status"] = "success";
  let statusLabel = wallet ? (WALLET_LABEL[e.kind] ?? "Completed") : "Completed";
  if (!wallet && e.kind === "payout" && e.ref_id) {
    const { data: p } = await supabase.from("payouts").select("status, failure_reason, reference").eq("id", e.ref_id).maybeSingle();
    const po = p as Row | null;
    if (po) {
      status = po.status === "paid" ? "success" : po.status === "failed" ? "failed" : "pending";
      statusLabel = po.status === "paid" ? "Withdrawal sent" : po.status === "failed" ? "Withdrawal failed" : "On its way to your bank";
      if (po.status === "failed" && po.failure_reason) rows.push({ label: "Reason", value: String(po.failure_reason) });
      rows.push({ label: "Transfer reference", value: String(po.reference) });
    }
  }
  return {
    model: {
      status,
      statusLabel,
      amount: Math.abs(amount),
      sign: amount < 0 ? "-" : "+",
      title: (wallet ? WALLET_TITLE[e.kind] : EARN_TITLE[e.kind]) ?? "Transaction",
      subtitle: e.note && !rows.some((r) => r.value === e.note) ? String(e.note) : undefined,
      when: e.created_at,
      rows,
      reference: String(e.reference ?? short(e.id)),
    },
    burst: { title: "Done" },
  };
}

export default function ReceiptScreen() {
  const colors = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ kind?: string; id?: string; ref?: string; fresh?: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [bursting, setBursting] = useState(params.fresh === "1");
  const [busy, setBusy] = useState(false);
  const burstShown = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    const kind = params.kind ?? "food";
    let res: Loaded | "redirect" | null = null;
    try {
      if (kind === "food" && params.id) res = await loadFood(params.id);
      else if (kind === "market" && params.id) res = await loadMarket(params.id, user.id);
      else if (kind === "topup" && params.ref) res = await loadTopup(params.ref);
      else if (kind === "request" && params.id) res = await loadRequest(params.id);
      else if (kind === "tx" && params.id) res = await loadEntry(params.id, user.id);
    } catch {
      res = null;
    }
    if (res === "redirect") return;
    setData(res);
    setMissing(!res);
    setLoading(false);
  }, [user, params.kind, params.id, params.ref]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Food orders change as the kitchen works; keep the receipt (and its code) current.
  const foodId = data?.food?.id;
  useEffect(() => {
    if (!foodId) return;
    const channel = supabase
      .channel(`receipt-${foodId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "food_orders", filter: `id=eq.${foodId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [foodId, load]);

  // The success moment only makes sense for a payment that actually went through.
  useEffect(() => {
    if (data && !burstShown.current) {
      burstShown.current = true;
      if (data.model.status === "failed") setBursting(false);
    }
  }, [data]);

  async function received() {
    if (!data?.food) return;
    setBusy(true);
    const { error } = await supabase.rpc("confirm_food_received", { p_order: data.food.id });
    setBusy(false);
    if (error) notify("Couldn't confirm", error.message, undefined, { tone: "danger" });
    else toast.success(data.food.delivery ? "Marked as delivered" : "Marked as collected");
    void load();
  }

  function report() {
    if (!data?.food) return;
    const id = data.food.id;
    notify("Report a problem?", "We will tell the kitchen your order has not arrived.", [
      { text: "Not now", style: "cancel" },
      {
        text: "Report problem",
        onPress: async () => {
          const { error } = await supabase.rpc("report_food_issue", { p_order: id, p_note: null });
          if (error) notify("Couldn't report", error.message, undefined, { tone: "danger" });
          else toast.success("The kitchen has been told");
          void load();
        },
      },
    ]);
  }

  const food = data?.food;
  const arriving = food?.status === "ready";

  return (
    <View style={{ flex: 1 }}>
      <PageShell
        title="Receipt"
        loading={loading}
        right={
          data ? (
            <Pressable
              onPress={() => void Share.share({ message: receiptText(data.model) })}
              hitSlop={10}
              accessibilityLabel="Share receipt"
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="share-outline" size={20} color={colors.fg} />
            </Pressable>
          ) : undefined
        }
        footer={
          food ? (
            arriving ? (
              <View style={{ gap: 8 }}>
                <Button title={food.delivery ? "I received my order" : "I collected my order"} onPress={() => void received()} loading={busy} />
                {food.issue ? (
                  <AppText muted size={12} style={{ textAlign: "center" }}>
                    Problem reported. The kitchen has been told.
                  </AppText>
                ) : (
                  <Button variant="secondary" title="Report a problem" onPress={report} />
                )}
              </View>
            ) : (
              <Button variant="secondary" title="My orders" onPress={() => router.push("/orders")} />
            )
          ) : undefined
        }
      >
        {missing ? (
          <Empty icon="receipt-outline" title="Receipt not found" body="It may have been removed." />
        ) : data ? (
          <>
            <ReceiptCard model={data.model} />
            {arriving ? (
              <Notice icon="information-circle-outline">
                {food?.delivery
                  ? "Show the code to the delivery person. Tap “I received my order” once it has arrived."
                  : "Show the code at the counter. Tap “I collected my order” once you have it."}
              </Notice>
            ) : null}
          </>
        ) : null}
      </PageShell>
      {bursting && data && data.model.status !== "failed" ? (
        <SuccessBurst
          title={data.burst.title}
          amount={data.model.amount}
          subtitle={data.burst.subtitle}
          onDone={() => setBursting(false)}
        />
      ) : null}
    </View>
  );
}
