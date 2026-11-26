import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { callPaystack } from "@/src/lib/payments";
import { PAY_RETURN_URL, usePaySheet } from "@/src/lib/pay-sheet";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";
import { notify } from "@/src/lib/feedback";

type Order = {
  id: string;
  status: string;
  total: number;
  notes: string | null;
  created_at: string;
  prep_minutes: number | null;
  decline_reason: string | null;
  accepted_at: string | null;
  business_id: string;
  fulfilment: string;
  delivery_address: string | null;
  delivery_fee: number;
  discount: number;
  payment_method: string;
  payment_status: string;
  business_profiles: { display_name: string } | { display_name: string }[] | null;
  food_order_items: { name: string; quantity: number; options: { name: string }[] | null }[] | null;
};

const STEPS = ["placed", "accepted", "preparing", "ready", "completed"] as const;
const STEP_LABEL: Record<string, string> = {
  placed: "Sent",
  accepted: "Accepted",
  preparing: "Cooking",
  ready: "Ready",
  completed: "Done",
};

const HEADLINE: Record<string, string> = {
  placed: "Waiting for the kitchen",
  accepted: "Order accepted",
  preparing: "Being prepared",
  ready: "Ready for pickup",
  collected: "Picked up",
  completed: "Picked up",
  declined: "Rejected by the kitchen",
  cancelled: "You cancelled this order",
};

function headline(o: Order) {
  if (o.status === "ready") return o.fulfilment === "delivery" ? "On its way" : "Ready for pickup";
  if (o.status === "completed" || o.status === "collected") return o.fulfilment === "delivery" ? "Delivered" : "Picked up";
  return HEADLINE[o.status] ?? o.status;
}

function paymentLabel(o: Order) {
  switch (o.payment_status) {
    case "paid":
      return o.payment_method === "wallet" ? "Paid from wallet" : "Paid by card";
    case "pending":
      return "Waiting for your card payment";
    case "refund_requested":
      return "Refund requested";
    case "refunded":
      return o.payment_method === "wallet" ? "Refunded to your wallet" : "Refunded to your card";
    case "failed":
      return "Payment failed";
    default:
      return o.payment_method === "cash" ? (o.fulfilment === "delivery" ? "Pay on delivery" : "Pay on collection") : "Unpaid";
  }
}

function kitchenName(o: Order) {
  const b = Array.isArray(o.business_profiles) ? o.business_profiles[0] : o.business_profiles;
  return b?.display_name ?? "Kitchen";
}

function stepIndex(status: string) {
  if (status === "collected") return STEPS.indexOf("completed");
  return STEPS.indexOf(status as (typeof STEPS)[number]);
}

function minutesLeft(o: Order) {
  if (!o.accepted_at || !o.prep_minutes) return null;
  const left = Math.ceil((new Date(o.accepted_at).getTime() + o.prep_minutes * 60000 - Date.now()) / 60000);
  return left;
}

export default function OrdersScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { payByCard } = usePaySheet();

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("food_orders")
      .select(
        "id, status, total, notes, created_at, prep_minutes, decline_reason, accepted_at, business_id, fulfilment, delivery_address, delivery_fee, discount, payment_method, payment_status, business_profiles(display_name), food_order_items(name, quantity, options)",
      )
      .eq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40);
    setOrders((data as unknown as Order[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
    if (!user) return;
    const channel = supabase
      .channel(`my-orders-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "food_orders", filter: `student_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user]);

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
      if (paid.status === "failed") notify("Payment not completed", "Your card was not charged. Try again or use another card.", undefined, { tone: "danger" });
      void load();
      return;
    }
    notify("Couldn't start payment", res.ok ? "Try again in a moment." : res.message);
  }

  function requestRefund(order: Order) {
    notify("Request a refund?", "The kitchen will review your request and you'll be notified.", [
      { text: "Not now", style: "cancel" },
      {
        text: "Request refund",
        onPress: async () => {
          const { error } = await supabase.rpc("request_refund", { p_order: order.id, p_reason: "Requested from the app" });
          if (error) notify("Couldn't request refund", error.message);
          void load();
        },
      },
    ]);
  }

  // Coming back from the card page: confirm any payments that finished while we were away.
  useEffect(() => {
    const pending = orders.filter((o) => o.payment_method === "card" && o.payment_status === "pending");
    if (!pending.length) return;
    const t = setInterval(async () => {
      for (const o of pending) await callPaystack(supabase, { action: "verify", order_id: o.id });
      void load();
    }, 8000);
    return () => clearInterval(t);
  }, [orders, load]);

  function cancel(order: Order) {
    notify("Cancel this order?", "The kitchen hasn't accepted it yet.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel order",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("food_orders").update({ status: "cancelled" }).eq("id", order.id);
          if (error) notify("Couldn't cancel", error.message);
          void load();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.back, { backgroundColor: colors.surface }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          My orders
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={colors.fg}
            />
          }
        >
          {!orders.length ? (
            <EmptyState
              title="No orders yet"
              description="Order from a campus kitchen in Market › Food and track it here."
            />
          ) : (
            orders.map((o) => {
              const idx = stepIndex(o.status);
              const dead = o.status === "declined" || o.status === "cancelled";
              const left = minutesLeft(o);
              return (
                <View key={o.id} style={[styles.card, { backgroundColor: colors.surface }]}>
                  <View style={styles.rowBetween}>
                    <AppText weight="700" size={16} style={{ flex: 1 }} numberOfLines={1}>
                      {kitchenName(o)}
                    </AppText>
                    <AppText weight="700">{formatNaira(o.total)}</AppText>
                  </View>
                  <AppText
                    weight="600"
                    size={14}
                    style={{ color: dead ? colors.danger : colors.fg }}
                  >
                    {headline(o)}
                  </AppText>
                  <AppText size={12} muted>
                    {o.fulfilment === "delivery" ? `Delivery to ${o.delivery_address ?? "your address"}` : "Pickup"} · {paymentLabel(o)}
                    {Number(o.discount) > 0 ? ` · saved ${formatNaira(Number(o.discount))}` : ""}
                  </AppText>

                  {!dead ? (
                    <View style={styles.steps}>
                      {STEPS.map((s, i) => (
                        <View key={s} style={{ flex: 1, gap: 6 }}>
                          <View
                            style={[
                              styles.bar,
                              { backgroundColor: i <= idx ? colors.accent : colors.border },
                            ]}
                          />
                          <AppText size={10} muted={i > idx} weight={i === idx ? "700" : "400"}>
                            {STEP_LABEL[s]}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {o.status === "accepted" || o.status === "preparing" ? (
                    <AppText size={13} muted>
                      {left == null
                        ? "The kitchen is on it."
                        : left > 0
                          ? `About ${left} min left`
                          : "Should be ready any moment"}
                    </AppText>
                  ) : null}
                  {o.status === "declined" && o.decline_reason ? (
                    <AppText size={13} muted>
                      {o.decline_reason}
                    </AppText>
                  ) : null}

                  <AppText size={13} muted>
                    {(o.food_order_items ?? [])
                      .map((i) => `${i.quantity}× ${i.name}${i.options?.length ? ` (${i.options.map((x) => x.name).join(", ")})` : ""}`)
                      .join(", ")}
                  </AppText>
                  {o.payment_method === "card" && o.payment_status === "pending" && !dead ? (
                    <Pressable onPress={() => void payNow(o)} style={[styles.payBtn, { backgroundColor: colors.inverseBg }]}>
                      <AppText weight="700" size={13} style={{ color: colors.inverseFg }}>
                        Pay now
                      </AppText>
                    </Pressable>
                  ) : null}
                  {o.payment_status === "paid" && (o.status === "completed" || o.status === "collected") ? (
                    <View style={{ flexDirection: "row", gap: 16 }}>
                      <Pressable onPress={() => router.push({ pathname: "/review", params: { kind: "order", ref: o.id, business: o.business_id, name: kitchenName(o) } })} hitSlop={8}>
                        <AppText size={13} weight="700">
                          Rate this order
                        </AppText>
                      </Pressable>
                      <Pressable onPress={() => requestRefund(o)} hitSlop={8}>
                        <AppText size={13} weight="700" style={{ color: colors.danger }}>
                          Request refund
                        </AppText>
                      </Pressable>
                    </View>
                  ) : null}
                  {o.payment_method === "cash" && (o.status === "completed" || o.status === "collected") ? (
                    <Pressable onPress={() => router.push({ pathname: "/review", params: { kind: "order", ref: o.id, business: o.business_id, name: kitchenName(o) } })} hitSlop={8}>
                      <AppText size={13} weight="700">
                        Rate this order
                      </AppText>
                    </Pressable>
                  ) : null}
                  <View style={styles.rowBetween}>
                    <AppText size={12} muted>
                      {new Date(o.created_at).toLocaleString()}
                    </AppText>
                    {o.status === "placed" ? (
                      <Pressable onPress={() => cancel(o)} hitSlop={8}>
                        <AppText size={13} weight="700" style={{ color: colors.danger }}>
                          Cancel
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radii.md, padding: 16, gap: 10 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  steps: { flexDirection: "row", gap: 6 },
  bar: { height: 4, borderRadius: 2 },
  payBtn: { height: 42, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
});
