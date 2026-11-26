import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Order = {
  id: string;
  status: string;
  total: number;
  notes: string | null;
  created_at: string;
  prep_minutes: number | null;
  decline_reason: string | null;
  accepted_at: string | null;
  business_profiles: { display_name: string } | { display_name: string }[] | null;
  food_order_items: { name: string; quantity: number }[] | null;
};

const STEPS = ["placed", "accepted", "preparing", "ready", "completed"] as const;
const STEP_LABEL: Record<string, string> = {
  placed: "Sent",
  accepted: "Accepted",
  preparing: "Cooking",
  ready: "Ready",
  completed: "Picked up",
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

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("food_orders")
      .select(
        "id, status, total, notes, created_at, prep_minutes, decline_reason, accepted_at, business_profiles(display_name), food_order_items(name, quantity)",
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

  function cancel(order: Order) {
    Alert.alert("Cancel this order?", "The kitchen hasn't accepted it yet.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel order",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("food_orders").update({ status: "cancelled" }).eq("id", order.id);
          if (error) Alert.alert("Couldn't cancel", error.message);
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
                    {HEADLINE[o.status] ?? o.status}
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
                    {(o.food_order_items ?? []).map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                  </AppText>
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
});
