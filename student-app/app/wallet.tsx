import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { AppText, Button, EmptyState, Input } from "@/src/components/ui";
import { ChipRow, Group, KeyValue, ListRow, Notice, Panel, Section, PageShell } from "@/src/components/page";
import { TxList } from "@/src/components/tx-rows";
import { DebitCard, PayoutCard, WALLET_CARD_HEIGHT, type LinkedCard } from "@/src/components/wallet-cards";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { callPaystack } from "@/src/lib/payments";
import { supabase } from "@/src/lib/supabase";
import { loadTransactions, type Tx } from "@/src/lib/transactions";
import { useTheme } from "@/src/theme/ThemeProvider";

type Quote = { credit: number; fee: number; total: number };
type Info = { enabled: boolean; min: number; max: number; cap: number };
type Seller = { is_seller: boolean; available: number; on_hold: number; withdrawal_open: boolean };

const PRESETS = [1000, 2000, 5000, 10000];
const CARD_GAP = 12;

function Action({ icon, label, onPress, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; active?: boolean }) {
  const colors = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.75 }]} accessibilityLabel={label}>
      <View style={[styles.actionIcon, { backgroundColor: active ? colors.inverseBg : colors.surface }]}>
        <Ionicons name={icon} size={22} color={active ? colors.inverseFg : colors.fg} />
      </View>
      <AppText size={12} weight="600" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function WalletScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const [balance, setBalance] = useState(0);
  const [frozen, setFrozen] = useState(false);
  const [name, setName] = useState("Student");
  const [card, setCard] = useState<LinkedCard>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [recent, setRecent] = useState<Tx[]>([]);
  const [page, setPage] = useState(0);
  const [info, setInfo] = useState<Info>({ enabled: true, min: 500, max: 100000, cap: 200000 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [amount, setAmount] = useState("2000");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const waitUntil = useRef(0);

  const cardWidth = width - 40;

  const load = useCallback(async () => {
    if (!user) return;
    const [w, profile, s, cardRes, sellerRes, tx] = await Promise.all([
      supabase.from("wallets").select("balance, status").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("first_name, last_name, preferred_name, full_name").eq("id", user.id).maybeSingle(),
      callPaystack(supabase, { action: "status" }),
      supabase.rpc("my_wallet_card"),
      supabase.rpc("my_seller_summary"),
      loadTransactions(supabase, { limit: 5 }),
    ]);
    const p = profile.data;
    const legal = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
    setName(legal || p?.full_name?.trim() || p?.preferred_name?.trim() || "Student");
    setBalance(Number(w.data?.balance ?? 0));
    setFrozen(w.data?.status === "frozen");
    setCard((cardRes.data as LinkedCard) ?? null);
    const sd = sellerRes.data as { is_seller: boolean; available: number; on_hold: number; withdrawal_open: boolean } | null;
    setSeller(sd ? { is_seller: sd.is_seller, available: Number(sd.available), on_hold: Number(sd.on_hold), withdrawal_open: sd.withdrawal_open } : null);
    setRecent(tx.rows);
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

  const canTopUp = info.enabled && !frozen;
  const showSeller = !!seller?.is_seller;
  const snap = cardWidth + CARD_GAP;

  return (
    <PageShell
      title="My wallet"
      subtitle="Pay for everything in CampusOS from here"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void confirmPayments();
        void load();
      }}
    >
      {/* Cards: the debit card first, the sales card next to it */}
      <View style={{ marginHorizontal: -20 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={snap}
          snapToAlignment="start"
          contentContainerStyle={{ paddingHorizontal: 20, gap: CARD_GAP }}
          onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / snap))}
          scrollEventThrottle={32}
          scrollEnabled={showSeller}
          style={{ height: WALLET_CARD_HEIGHT }}
        >
          <View style={{ width: cardWidth }}>
            <DebitCard name={name} balance={balance} card={card} frozen={frozen} />
          </View>
          {showSeller && seller ? (
            <View style={{ width: cardWidth }}>
              <PayoutCard
                available={seller.available}
                onHold={seller.on_hold}
                onBank={() => router.push({ pathname: "/payout", params: { to: "bank" } })}
                onWallet={() => router.push({ pathname: "/payout", params: { to: "wallet" } })}
                onOpen={() => router.push("/earnings")}
              />
            </View>
          ) : null}
        </ScrollView>
        {showSeller ? (
          <View style={styles.dots}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.dot, { backgroundColor: page === i ? colors.fg : colors.border, width: page === i ? 18 : 6 }]} />
            ))}
          </View>
        ) : null}
      </View>

      {frozen ? <Notice tone="danger">Your wallet is on hold. Contact support to get it unlocked.</Notice> : null}
      {!info.enabled ? <Notice tone="warn">Adding money is paused for now. You can still use your balance.</Notice> : null}

      <View style={styles.actions}>
        <Action icon="add-circle-outline" label="Add money" active={showTopUp} onPress={() => setShowTopUp((v) => !v)} />
        <Action icon="receipt-outline" label="History" onPress={() => router.push("/transactions")} />
        <Action icon="bag-handle-outline" label="Purchases" onPress={() => router.push("/market-orders")} />
        <Action icon="diamond-outline" label="Premium" onPress={() => router.push("/premium")} />
      </View>

      {showTopUp && canTopUp ? (
        <Section title="Add money" hint="Cards only: Visa, Mastercard, Verve and others Paystack accepts">
          <ChipRow
            options={PRESETS.map((p) => ({ value: String(p), label: formatNaira(p) }))}
            value={String(value)}
            onChange={setAmount}
          />
          <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="Other amount" />
          {quote && !problem ? (
            <Panel>
              <KeyValue label="Added to wallet" value={formatNaira(quote.credit)} />
              <KeyValue label="Card fee" value={formatNaira(quote.fee)} />
              <KeyValue label="You pay" value={formatNaira(quote.total)} strong />
            </Panel>
          ) : null}
          {problem ? <Notice tone="danger">{problem}</Notice> : null}
          <Button
            title={busy ? "Opening card page…" : quote && !problem ? `Pay ${formatNaira(quote.total)} by card` : "Add money by card"}
            onPress={() => void topUp()}
            disabled={!!problem}
            loading={busy}
          />
          {waiting ? (
            <Notice icon="time-outline">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ActivityIndicator color={colors.fg} />
                <AppText size={13} style={{ flex: 1 }}>
                  Waiting for your payment. This page updates as soon as it goes through.
                </AppText>
              </View>
            </Notice>
          ) : null}
          <AppText size={12} muted>
            The card fee is shown before you pay. Wallet money can only be spent inside CampusOS. It can't be withdrawn or sent to others.
          </AppText>
        </Section>
      ) : null}
      {message ? <Notice tone={message.startsWith("Payment received") ? "success" : "neutral"}>{message}</Notice> : null}

      <Section
        title="Recent activity"
        action={
          recent.length ? (
            <Pressable onPress={() => router.push("/transactions")} hitSlop={8}>
              <AppText size={13} weight="700">
                See all
              </AppText>
            </Pressable>
          ) : undefined
        }
      >
        {!recent.length ? (
          <EmptyState title="No wallet activity yet" description="Top-ups, purchases, sales and withdrawals will show up here." />
        ) : (
          <>
            <TxList rows={recent} />
            <Button variant="secondary" title="See all transactions" onPress={() => router.push("/transactions")} />
          </>
        )}
      </Section>

      <Section title="More">
        <Group>
          <ListRow icon="bag-handle-outline" title="Purchases & sales" subtitle="Marketplace orders, handovers and disputes" onPress={() => router.push("/market-orders")} />
          <ListRow icon="receipt-outline" title="Payment requests" subtitle="Rent, deposits and fees sent to you" onPress={() => router.push("/payments")} />
          <ListRow icon="cash-outline" title="Earnings & bank account" subtitle="Your sales money and where it is paid" onPress={() => router.push("/earnings")} />
        </Group>
      </Section>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, alignItems: "center", gap: 6 },
  actionIcon: { width: 56, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 10 },
  dot: { height: 6, borderRadius: 3 },
});
