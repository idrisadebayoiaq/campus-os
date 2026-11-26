import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Request = {
  id: string;
  kind: string;
  title: string;
  amount: number;
  due_on: string | null;
  status: string;
  created_at: string;
  business_profiles: { display_name: string } | { display_name: string }[] | null;
};

const KIND: Record<string, string> = {
  rent: "Rent",
  deposit: "Deposit",
  agent_fee: "Agent fee",
  agreement_fee: "Agreement fee",
  service_fee: "Service fee",
  other: "Payment",
};

export default function PaymentRequestsScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Request[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [r, w] = await Promise.all([
      supabase
        .from("payment_requests")
        .select("id, kind, title, amount, due_on, status, created_at, business_profiles(display_name)")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    ]);
    setRows((r.data as unknown as Request[]) ?? []);
    setBalance(Number(w.data?.balance ?? 0));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  function pay(r: Request) {
    if (balance < Number(r.amount)) {
      Alert.alert("Not enough in your wallet", `You need ${formatNaira(r.amount)} and have ${formatNaira(balance)}.`, [
        { text: "Later", style: "cancel" },
        { text: "Add money", onPress: () => router.push("/wallet") },
      ]);
      return;
    }
    Alert.alert("Pay from wallet?", `${formatNaira(r.amount)} for ${r.title} will be taken from your wallet.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Pay",
        onPress: async () => {
          setBusy(r.id);
          const { error } = await supabase.rpc("pay_payment_request", { p_request: r.id });
          setBusy(null);
          if (error) Alert.alert("Couldn't pay", error.message);
          void load();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Payment requests
        </AppText>
        <View style={{ width: 40 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.fg} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          <AppText size={12} muted>
            Wallet balance {formatNaira(balance)}
          </AppText>
          {!rows.length ? (
            <EmptyState title="No payment requests" description="Rent, deposits and fees your landlord or a service sends you appear here." />
          ) : (
            rows.map((r) => {
              const biz = Array.isArray(r.business_profiles) ? r.business_profiles[0] : r.business_profiles;
              return (
                <View key={r.id} style={[styles.card, { backgroundColor: colors.surface }]}>
                  <View style={styles.rowBetween}>
                    <AppText weight="700" style={{ flex: 1 }}>
                      {r.title}
                    </AppText>
                    <AppText weight="700">{formatNaira(r.amount)}</AppText>
                  </View>
                  <AppText size={12} muted>
                    {biz?.display_name ?? "Provider"} · {KIND[r.kind] ?? "Payment"}
                    {r.due_on ? ` · due ${new Date(r.due_on).toLocaleDateString()}` : ""}
                  </AppText>
                  {r.status === "pending" ? (
                    <Pressable onPress={() => pay(r)} disabled={busy === r.id} style={[styles.cta, { backgroundColor: colors.inverseBg, opacity: busy === r.id ? 0.5 : 1 }]}>
                      <AppText weight="700" size={13} style={{ color: colors.inverseFg }}>
                        {busy === r.id ? "Paying…" : "Pay from wallet"}
                      </AppText>
                    </Pressable>
                  ) : (
                    <AppText size={13} weight="600">
                      {r.status === "paid" ? "Paid" : r.status === "refunded" ? "Refunded to your wallet" : "Cancelled"}
                    </AppText>
                  )}
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
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radii.md, padding: 14, gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cta: { height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
});
