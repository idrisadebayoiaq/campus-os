import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { callPaystack } from "@/src/lib/payments";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Entry = { id: string; kind: string; amount: number; note: string | null; purpose: string | null; created_at: string };
type Quote = { credit: number; fee: number; total: number };
type Info = { enabled: boolean; min: number; max: number; cap: number };

const PRESETS = [1000, 2000, 5000, 10000];

const KIND_LABEL: Record<string, string> = {
  topup: "Top-up",
  spend: "Payment",
  refund: "Refund",
  adjust: "Adjustment",
  reversal: "Reversal",
  subscription: "Subscription",
  escrow_hold: "Held for purchase",
  escrow_release: "Released",
};

export default function WalletScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState(0);
  const [frozen, setFrozen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [info, setInfo] = useState<Info>({ enabled: true, min: 500, max: 100000, cap: 200000 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState("2000");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const waitUntil = useRef(0);

  const load = useCallback(async () => {
    if (!user) return;
    const [w, e, s] = await Promise.all([
      supabase.from("wallets").select("balance, status").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("wallet_entries")
        .select("id, kind, amount, note, purpose, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40),
      callPaystack(supabase, { action: "status" }),
    ]);
    setBalance(Number(w.data?.balance ?? 0));
    setFrozen(w.data?.status === "frozen");
    setEntries((e.data as Entry[]) ?? []);
    if (s.ok) {
      setInfo({
        enabled: s.data.wallet_enabled !== false,
        min: Number(s.data.topup_min ?? 500),
        max: Number(s.data.topup_max ?? 100000),
        cap: Number(s.data.wallet_cap ?? 200000),
      });
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ask for payments that finished while the card page was open.
  const confirmPayments = useCallback(async () => {
    const res = await callPaystack(supabase, { action: "verify-mine" });
    if (res.ok && Number(res.data.settled ?? 0) > 0) {
      setWaiting(false);
      setMessage("Payment received. Your wallet has been topped up.");
      void load();
    }
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && waitUntil.current > Date.now()) void confirmPayments();
    });
    return () => sub.remove();
  }, [confirmPayments]);

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => {
      if (Date.now() > waitUntil.current) {
        setWaiting(false);
        return;
      }
      void confirmPayments();
    }, 6000);
    return () => clearInterval(t);
  }, [waiting, confirmPayments]);

  const value = Math.round(Number(amount.replace(/[^0-9]/g, "")) || 0);

  useEffect(() => {
    if (value < info.min || value > info.max) {
      setQuote(null);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("topup_quote", { p_amount: value });
      const row = (Array.isArray(data) ? data[0] : data) as Quote | undefined;
      setQuote(row ? { credit: Number(row.credit), fee: Number(row.fee), total: Number(row.total) } : null);
    }, 250);
    return () => clearTimeout(t);
  }, [value, info.min, info.max]);

  const problem =
    value < info.min
      ? `The smallest top-up is ${formatNaira(info.min)}.`
      : value > info.max
        ? `The largest top-up is ${formatNaira(info.max)}.`
        : balance + value > info.cap
          ? `Your wallet can hold up to ${formatNaira(info.cap)}.`
          : null;

  async function topUp() {
    if (problem || busy) return;
    setBusy(true);
    setMessage(null);
    const res = await callPaystack(supabase, { action: "init-topup", amount: value });
    setBusy(false);
    if (res.ok && typeof res.data.authorization_url === "string") {
      waitUntil.current = Date.now() + 5 * 60 * 1000;
      setWaiting(true);
      void Linking.openURL(res.data.authorization_url);
      return;
    }
    setMessage(res.ok ? "Couldn't start the payment. Try again." : res.message);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          My wallet
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.fg} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void confirmPayments();
                void load();
              }}
            />
          }
        >
          <View style={[styles.balanceCard, { backgroundColor: colors.inverseBg }]}>
            <AppText size={12} style={{ color: colors.inverseFg, opacity: 0.7 }}>
              Wallet balance
            </AppText>
            <AppText size={34} weight="700" style={{ color: colors.inverseFg }}>
              {formatNaira(balance)}
            </AppText>
            <AppText size={12} style={{ color: colors.inverseFg, opacity: 0.7 }}>
              Spend it on food, subscriptions and more in CampusOS. Refunds come back here.
            </AppText>
          </View>

          {frozen ? (
            <AppText size={13} style={{ color: colors.danger }}>
              Your wallet is on hold. Contact support to get it unlocked.
            </AppText>
          ) : null}

          {info.enabled && !frozen ? (
            <View style={{ gap: 10 }}>
              <AppText weight="700">Add money</AppText>
              <View style={styles.presets}>
                {PRESETS.map((p) => {
                  const on = value === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setAmount(String(p))}
                      style={[styles.preset, { backgroundColor: on ? colors.inverseBg : colors.surface }]}
                    >
                      <AppText weight="700" size={13} style={{ color: on ? colors.inverseFg : colors.fg }}>
                        {formatNaira(p)}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="number-pad"
                placeholder="Other amount"
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.fg, borderColor: colors.border, backgroundColor: colors.surface }]}
              />
              {quote && !problem ? (
                <View style={[styles.quote, { backgroundColor: colors.surface }]}>
                  <View style={styles.rowBetween}>
                    <AppText muted>Added to wallet</AppText>
                    <AppText>{formatNaira(quote.credit)}</AppText>
                  </View>
                  <View style={styles.rowBetween}>
                    <AppText muted>Card fee</AppText>
                    <AppText>{formatNaira(quote.fee)}</AppText>
                  </View>
                  <View style={styles.rowBetween}>
                    <AppText weight="700">You pay</AppText>
                    <AppText weight="700">{formatNaira(quote.total)}</AppText>
                  </View>
                </View>
              ) : null}
              {problem ? (
                <AppText size={13} style={{ color: colors.danger }}>
                  {problem}
                </AppText>
              ) : null}
              <Pressable
                onPress={() => void topUp()}
                disabled={busy || !!problem}
                style={[styles.cta, { backgroundColor: colors.inverseBg, opacity: busy || problem ? 0.5 : 1 }]}
              >
                <AppText weight="700" style={{ color: colors.inverseFg }}>
                  {busy ? "Opening card page…" : quote ? `Pay ${formatNaira(quote.total)} by card` : "Add money by card"}
                </AppText>
              </Pressable>
              <AppText size={11} muted>
                Visa, Mastercard, Verve and other cards Paystack accepts. The card fee is shown before you pay. Wallet money can only be spent inside CampusOS and can't be withdrawn or sent to others.
              </AppText>
              {waiting ? (
                <View style={[styles.quote, { backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 10 }]}>
                  <ActivityIndicator color={colors.fg} />
                  <AppText size={13} style={{ flex: 1 }}>
                    Waiting for your payment. This page updates as soon as it goes through.
                  </AppText>
                </View>
              ) : null}
              {message ? <AppText size={13}>{message}</AppText> : null}
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <AppText weight="700">History</AppText>
            {!entries.length ? (
              <EmptyState title="No wallet activity yet" description="Top-ups, payments and refunds will show up here." />
            ) : (
              entries.map((e) => {
                const credit = Number(e.amount) > 0;
                return (
                  <View key={e.id} style={[styles.entry, { backgroundColor: colors.surface }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText weight="600">{KIND_LABEL[e.kind] ?? e.kind}</AppText>
                      <AppText size={12} muted numberOfLines={1}>
                        {e.note ? `${e.note} · ` : ""}
                        {new Date(e.created_at).toLocaleDateString()}
                      </AppText>
                    </View>
                    <AppText weight="700" style={{ color: credit ? colors.fg : colors.muted }}>
                      {credit ? "+" : "-"}
                      {formatNaira(Math.abs(Number(e.amount)))}
                    </AppText>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  balanceCard: { borderRadius: radii.lg ?? radii.md, padding: 20, gap: 6 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { paddingHorizontal: 14, height: 38, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  input: { height: 46, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12, fontSize: 14 },
  quote: { borderRadius: radii.md, padding: 14, gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cta: { height: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  entry: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
});
