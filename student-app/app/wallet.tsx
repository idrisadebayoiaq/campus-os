import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, View } from "react-native";
import { AppText, Button, EmptyState, Input } from "@/src/components/ui";
import { ChipRow, Group, Hero, KeyValue, ListRow, Notice, Panel, Pill, Section, PageShell } from "@/src/components/page";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { callPaystack } from "@/src/lib/payments";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

type Entry = { id: string; kind: string; amount: number; note: string | null; purpose: string | null; created_at: string };
type Quote = { credit: number; fee: number; total: number };
type Info = { enabled: boolean; min: number; max: number; cap: number };
type Premium = { active: boolean; endsAt: string | null; autoRenew: boolean; price: number };

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
  const [premium, setPremium] = useState<Premium>({ active: false, endsAt: null, autoRenew: true, price: 1000 });
  const [premiumBusy, setPremiumBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [w, e, s, sub, price] = await Promise.all([
      supabase.from("wallets").select("balance, status").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("wallet_entries")
        .select("id, kind, amount, note, purpose, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40),
      callPaystack(supabase, { action: "status" }),
      supabase.from("student_subscriptions").select("status, ends_at, auto_renew").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("setting_num", { p_key: "student_plan_price", p_default: 1000 }),
    ]);
    setPremium({
      active: sub.data?.status === "active" && new Date(sub.data.ends_at).getTime() > Date.now(),
      endsAt: sub.data?.ends_at ?? null,
      autoRenew: sub.data?.auto_renew ?? true,
      price: Number(price.data ?? 1000),
    });
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

  async function subscribe() {
    setPremiumBusy(true);
    const { error } = await supabase.rpc("subscribe_premium");
    setPremiumBusy(false);
    if (error) setMessage(error.message);
    void load();
  }

  async function toggleRenew() {
    setPremiumBusy(true);
    await supabase.rpc("set_premium_auto_renew", { p_on: !premium.autoRenew });
    setPremiumBusy(false);
    void load();
  }

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
      <Hero
        label="Wallet balance"
        value={formatNaira(balance)}
        note="Food, marketplace, rent, fees and subscriptions are all paid from this balance. Refunds come back here."
      />

      {frozen ? <Notice tone="danger">Your wallet is on hold. Contact support to get it unlocked.</Notice> : null}
      {!info.enabled ? <Notice tone="warn">Adding money is paused for now. You can still use your balance.</Notice> : null}

      {canTopUp ? (
        <Section title="Add money" hint="Cards only: Visa, Mastercard, Verve and others Paystack accepts">
          <ChipRow
            options={PRESETS.map((p) => ({ value: String(p), label: formatNaira(p) }))}
            value={String(value)}
            onChange={setAmount}
          />
          <Input
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="Other amount"
          />
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
          {message ? <Notice tone={message.startsWith("Payment received") ? "success" : "neutral"}>{message}</Notice> : null}
          <AppText size={12} muted>
            The card fee is shown before you pay. Wallet money can only be spent inside CampusOS. It can't be withdrawn or sent to others.
          </AppText>
        </Section>
      ) : null}

      <Section title="CampusOS Premium">
        <Panel>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <AppText weight="700">Premium</AppText>
              <AppText muted size={13}>
                {formatNaira(premium.price)} per month, paid from your wallet
              </AppText>
            </View>
            {premium.active ? <Pill label="Active" tone="success" /> : null}
          </View>
          {premium.active ? (
            <>
              <AppText size={13}>Active until {premium.endsAt ? new Date(premium.endsAt).toLocaleDateString() : ""}.</AppText>
              <Button
                compact
                variant="secondary"
                title={premium.autoRenew ? "Stop renewing" : "Renew automatically"}
                onPress={() => void toggleRenew()}
                loading={premiumBusy}
              />
            </>
          ) : (
            <Button
              compact
              title={balance < premium.price ? `Add ${formatNaira(premium.price)} first` : "Subscribe from wallet"}
              onPress={() => void subscribe()}
              disabled={balance < premium.price}
              loading={premiumBusy}
            />
          )}
        </Panel>
      </Section>

      <Section title="More">
        <Group>
          <ListRow icon="bag-handle-outline" title="Purchases & sales" subtitle="Marketplace orders, handovers and disputes" onPress={() => router.push("/market-orders")} />
          <ListRow icon="receipt-outline" title="Payment requests" subtitle="Rent, deposits and fees sent to you" onPress={() => router.push("/payments")} />
          <ListRow icon="cash-outline" title="My earnings" subtitle="Money from your sales, withdraw to your bank" onPress={() => router.push("/earnings")} />
        </Group>
      </Section>

      <Section title="History">
        {!entries.length ? (
          <EmptyState title="No wallet activity yet" description="Top-ups, payments and refunds will show up here." />
        ) : (
          <Group>
            {entries.map((e) => {
              const credit = Number(e.amount) > 0;
              return (
                <ListRow
                  key={e.id}
                  title={KIND_LABEL[e.kind] ?? e.kind}
                  subtitle={`${e.note ? `${e.note} · ` : ""}${new Date(e.created_at).toLocaleDateString()}`}
                  value={`${credit ? "+" : "-"}${formatNaira(Math.abs(Number(e.amount)))}`}
                  valueTone={credit ? "success" : "neutral"}
                />
              );
            })}
          </Group>
        )}
      </Section>
    </PageShell>
  );
}
