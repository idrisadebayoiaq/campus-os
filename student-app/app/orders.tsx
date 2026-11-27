import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Empty, PageShell, Pill, Segmented, type Tone } from "@/src/components/page";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { notify, toast } from "@/src/lib/feedback";
import { callPaystack } from "@/src/lib/payments";
import { PAY_RETURN_URL, usePaySheet } from "@/src/lib/pay-sheet";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Biz = { display_name: string; logo_url: string | null };
type Order = {
  id: string;
  status: string;
  total: number;
  created_at: string;
  prep_minutes: number | null;
  decline_reason: string | null;
  accepted_at: string | null;
  business_id: string;
  fulfilment: string;
  delivery_address: string | null;
  discount: number;
  payment_method: string;
  payment_status: string;
  receipt_no: string | null;
  issue_reported_at: string | null;
  business_profiles: Biz | Biz[] | null;
  food_order_items: { name: string; quantity: number; options: { name: string }[] | null }[] | null;
};

const LIVE = new Set(["placed", "accepted", "preparing", "ready"]);
const STEPS = [
  { key: "placed", label: "Sent", icon: "paper-plane" },
  { key: "accepted", label: "Accepted", icon: "checkmark" },
  { key: "preparing", label: "Cooking", icon: "flame" },
  { key: "ready", label: "Ready", icon: "bag-check" },
] as const;

function biz(o: Order): Biz {
  const b = Array.isArray(o.business_profiles) ? o.business_profiles[0] : o.business_profiles;
  return b ?? { display_name: "Kitchen", logo_url: null };
}

function status(o: Order): { label: string; tone: Tone } {
  switch (o.status) {
    case "placed":
      return { label: "Waiting", tone: "warn" };
    case "accepted":
      return { label: "Accepted", tone: "warn" };
    case "preparing":
      return { label: "Cooking", tone: "warn" };
    case "ready":
      return { label: o.fulfilment === "delivery" ? "On its way" : "Ready for pickup", tone: "success" };
    case "collected":
    case "completed":
      return { label: o.fulfilment === "delivery" ? "Delivered" : "Picked up", tone: "success" };
    case "declined":
      return { label: "Declined", tone: "danger" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "payment_failed":
      return { label: "Payment failed", tone: "danger" };
    case "expired":
      return { label: "Expired", tone: "neutral" };
    default:
      return { label: o.status, tone: "neutral" };
  }
}

function payment(o: Order) {
  switch (o.payment_status) {
    case "paid":
      return o.payment_method === "wallet" ? "Wallet" : "Card";
    case "pending":
      return "Awaiting payment";
    case "refund_requested":
      return "Refund requested";
    case "refunded":
      return "Refunded";
    case "failed":
      return "Payment failed";
    default:
      return o.payment_method === "cash" ? "Cash" : "Unpaid";
  }
}

function minutesLeft(o: Order) {
  if (!o.accepted_at || !o.prep_minutes) return null;
  return Math.ceil((new Date(o.accepted_at).getTime() + o.prep_minutes * 60000 - Date.now()) / 60000);
}

export default function OrdersScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"active" | "past">("active");
  const { payByCard } = usePaySheet();

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("food_orders")
      .select(
        "id, status, total, created_at, prep_minutes, decline_reason, accepted_at, business_id, fulfilment, delivery_address, discount, payment_method, payment_status, receipt_no, issue_reported_at, business_profiles(display_name, logo_url), food_order_items(name, quantity, options)",
      )
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data as unknown as Order[]) ?? [];
    setOrders(rows);
    // Delivery codes for orders still in progress (only the student can read these).
    const liveIds = rows.filter((o) => LIVE.has(o.status)).map((o) => o.id);
    if (liveIds.length) {
      const { data: c } = await supabase.from("food_order_codes").select("order_id, code").in("order_id", liveIds);
      setCodes(Object.fromEntries(((c ?? []) as { order_id: string; code: string }[]).map((x) => [x.order_id, x.code])));
    } else {
      setCodes({});
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
    if (!user) return;
    const channel = supabase
      .channel(`my-orders-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "food_orders", filter: `student_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user]);

  // Coming back from the card page: confirm any payments that finished while we were away.
  useEffect(() => {
    const pending = orders.filter((o) => o.payment_method === "card" && o.payment_status === "pending" && LIVE.has(o.status));
    if (!pending.length) return;
    const t = setInterval(async () => {
      for (const o of pending) await callPaystack(supabase, { action: "verify", order_id: o.id });
      void load();
    }, 8000);
    return () => clearInterval(t);
  }, [orders, load]);

  const active = useMemo(() => orders.filter((o) => LIVE.has(o.status)), [orders]);
  const past = useMemo(() => orders.filter((o) => !LIVE.has(o.status)), [orders]);
  const list = tab === "active" ? active : past;

  async function payNow(order: Order) {
    const res = await callPaystack(supabase, { action: "init-order", order_id: order.id, callback_url: PAY_RETURN_URL });
    if (res.ok && typeof res.data.authorization_url === "string" && typeof res.data.reference === "string") {
      const paid = await payByCard({
        url: res.data.authorization_url,
        reference: res.data.reference,
        title: "Pay for your order",
        amount: order.total,
        successText: "Payment received. The kitchen has your order.",
      });
      if (paid.status === "failed") notify("Payment not completed", "Your card was not charged.", undefined, { tone: "danger" });
      else if (paid.status === "success") router.push({ pathname: "/receipt", params: { kind: "food", id: order.id, fresh: "1" } });
      void load();
      return;
    }
    notify("Couldn't start payment", res.ok ? "Try again in a moment." : res.message, undefined, { tone: "danger" });
  }

  function requestRefund(order: Order) {
    notify("Request a refund?", "The kitchen will review it.", [
      { text: "Not now", style: "cancel" },
      {
        text: "Request refund",
        onPress: async () => {
          const { error } = await supabase.rpc("request_refund", { p_order: order.id, p_reason: "Requested from the app" });
          if (error) notify("Couldn't request refund", error.message, undefined, { tone: "danger" });
          else notify("Refund requested", undefined, undefined, { tone: "success" });
          void load();
        },
      },
    ]);
  }

  async function received(order: Order) {
    const { error } = await supabase.rpc("confirm_food_received", { p_order: order.id });
    if (error) notify("Couldn't confirm", error.message, undefined, { tone: "danger" });
    else toast.success(order.fulfilment === "delivery" ? "Marked as delivered" : "Marked as collected");
    void load();
  }

  function report(order: Order) {
    notify("Report a problem?", "We will tell the kitchen your order has not arrived.", [
      { text: "Not now", style: "cancel" },
      {
        text: "Report problem",
        onPress: async () => {
          const { error } = await supabase.rpc("report_food_issue", { p_order: order.id, p_note: null });
          if (error) notify("Couldn't report", error.message, undefined, { tone: "danger" });
          else toast.success("The kitchen has been told");
          void load();
        },
      },
    ]);
  }

  function cancel(order: Order) {
    notify("Cancel this order?", undefined, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel order",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("food_orders").update({ status: "cancelled" }).eq("id", order.id);
          if (error) notify("Couldn't cancel", error.message, undefined, { tone: "danger" });
          void load();
        },
      },
    ]);
  }

  return (
    <PageShell
      title="My orders"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "active", label: active.length ? `Active (${active.length})` : "Active" },
          { value: "past", label: "Past" },
        ]}
      />

      {!list.length ? (
        <Empty
          icon="fast-food-outline"
          title={tab === "active" ? "No active orders" : "No past orders"}
          action={<Button title="Order food" compact onPress={() => router.push("/explore/food")} style={{ marginTop: 8 }} />}
        />
      ) : (
        list.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            code={codes[o.id]}
            onReceived={() => void received(o)}
            onReport={() => report(o)}
            onPay={() => void payNow(o)}
            onCancel={() => cancel(o)}
            onRefund={() => requestRefund(o)}
          />
        ))
      )}
    </PageShell>
  );
}

function OrderCard({
  order: o,
  code,
  onReceived,
  onReport,
  onPay,
  onCancel,
  onRefund,
}: {
  order: Order;
  code?: string;
  onReceived: () => void;
  onReport: () => void;
  onPay: () => void;
  onCancel: () => void;
  onRefund: () => void;
}) {
  const colors = useTheme();
  const b = biz(o);
  const s = status(o);
  const live = LIVE.has(o.status);
  const idx = STEPS.findIndex((x) => x.key === o.status);
  const left = minutesLeft(o);
  const items = o.food_order_items ?? [];
  const done = o.status === "completed" || o.status === "collected";
  const review = () =>
    router.push({ pathname: "/review", params: { kind: "order", ref: o.id, business: o.business_id, name: b.display_name } });

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.head}>
        {b.logo_url ? (
          <Image source={{ uri: b.logo_url }} style={styles.logo} />
        ) : (
          <View style={[styles.logo, { backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="restaurant" size={20} color={colors.fg} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <AppText weight="700" size={16} numberOfLines={1}>
            {b.display_name}
          </AppText>
          <AppText muted size={12}>
            {o.receipt_no ?? `#${o.id.slice(0, 6).toUpperCase()}`} ·{" "}
            {new Date(o.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </AppText>
        </View>
        <Pill label={s.label} tone={s.tone} />
      </View>

      {live ? (
        <View style={{ gap: 8 }}>
          <View style={styles.steps}>
            {STEPS.map((step, i) => {
              const reached = i <= idx;
              return (
                <View key={step.key} style={styles.step}>
                  {i > 0 ? (
                    <View style={[styles.line, { backgroundColor: i <= idx ? colors.success : colors.border }]} />
                  ) : null}
                  <View style={[styles.dot, { backgroundColor: reached ? colors.success : colors.bg, borderColor: reached ? colors.success : colors.border }]}>
                    <Ionicons name={step.icon} size={13} color={reached ? "#fff" : colors.muted} />
                  </View>
                  <AppText size={10} weight={i === idx ? "700" : "500"} muted={!reached}>
                    {step.label}
                  </AppText>
                </View>
              );
            })}
          </View>
          {(o.status === "accepted" || o.status === "preparing") && left != null ? (
            <AppText size={13} weight="600" style={{ textAlign: "center" }}>
              {left > 0 ? `About ${left} min left` : "Almost ready"}
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.items, { borderColor: colors.border }]}>
        {items.slice(0, 4).map((i, n) => (
          <View key={n} style={styles.itemRow}>
            <AppText weight="700" size={13} style={{ width: 28 }}>
              {i.quantity}×
            </AppText>
            <AppText size={13} style={{ flex: 1 }} numberOfLines={1}>
              {i.name}
              {i.options?.length ? <AppText muted size={12}>{`  ${i.options.map((x) => x.name).join(", ")}`}</AppText> : null}
            </AppText>
          </View>
        ))}
        {items.length > 4 ? (
          <AppText muted size={12}>
            +{items.length - 4} more
          </AppText>
        ) : null}
      </View>

      {o.status === "declined" && o.decline_reason ? (
        <AppText size={13} style={{ color: colors.danger }}>
          {o.decline_reason}
        </AppText>
      ) : null}

      <View style={styles.foot}>
        <View style={{ flex: 1 }}>
          <AppText muted size={12}>
            {o.fulfilment === "delivery" ? "Delivery" : "Pickup"} · {payment(o)}
            {Number(o.discount) > 0 ? ` · saved ${formatNaira(Number(o.discount))}` : ""}
          </AppText>
        </View>
        <AppText weight="700" size={17}>
          {formatNaira(o.total)}
        </AppText>
      </View>

      {live && code && o.status !== "placed" ? (
        <View style={[styles.codeRow, { backgroundColor: colors.accentSoft }]}>
          <View style={{ flex: 1 }}>
            <AppText size={12} weight="700">
              {o.fulfilment === "delivery" ? "DELIVERY CODE" : "PICKUP CODE"}
            </AppText>
            <AppText muted size={12}>
              Show it when your order arrives
            </AppText>
          </View>
          <AppText weight="700" size={26} style={{ letterSpacing: 6 }}>
            {code}
          </AppText>
        </View>
      ) : null}
      {o.payment_method === "card" && o.payment_status === "pending" && live ? (
        <Button title="Pay now" compact onPress={onPay} />
      ) : null}
      {o.status === "ready" ? (
        <View style={styles.actions}>
          <Button title={o.fulfilment === "delivery" ? "I received it" : "I collected it"} compact onPress={onReceived} style={{ flex: 1 }} />
          {o.issue_reported_at ? null : <Button title="Report" compact variant="secondary" onPress={onReport} style={{ flex: 1 }} />}
        </View>
      ) : null}
      {o.payment_status !== "pending" ? (
        <Button
          title="View receipt"
          compact
          variant="secondary"
          onPress={() => router.push({ pathname: "/receipt", params: { kind: "food", id: o.id } })}
        />
      ) : null}
      {o.status === "placed" ? <Button title="Cancel order" compact variant="danger" onPress={onCancel} /> : null}
      {done ? (
        <View style={styles.actions}>
          <Button title="Rate" compact variant="secondary" onPress={review} style={{ flex: 1 }} />
          {o.payment_status === "paid" ? (
            <Button title="Refund" compact variant="danger" onPress={onRefund} style={{ flex: 1 }} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, padding: 16, gap: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 46, height: 46, borderRadius: 14 },
  steps: { flexDirection: "row" },
  step: { flex: 1, alignItems: "center", gap: 6 },
  line: { position: "absolute", top: 13, right: "50%", width: "100%", height: 3, borderRadius: 2 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  items: { gap: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  itemRow: { flexDirection: "row", alignItems: "center" },
  foot: { flexDirection: "row", alignItems: "center", gap: 10 },
  actions: { flexDirection: "row", gap: 10 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 10 },
});
