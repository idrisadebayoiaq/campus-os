import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, View } from "react-native";
import { Group, KeyValue, Notice, PageShell, Panel, Section } from "@/src/components/page";
import { PremiumBadge, PREMIUM_GREEN } from "@/src/components/premium-badge";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { callPaystack } from "@/src/lib/payments";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

type State = {
  active: boolean;
  ends_at: string | null;
  auto_renew: boolean;
  pay_method: "card" | "wallet" | null;
  card: { brand: string | null; last4: string | null; exp: string } | null;
  price: number;
};

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; soon?: boolean }[] = [
  { icon: "checkmark-circle", title: "Green Premium badge", body: "Shown next to your name on your profile, chats and marketplace listings." },
  { icon: "sparkles", title: "Higher AI tutor limits", body: "Ask your study tutor three times more questions every hour and every day." },
  { icon: "pricetag", title: "Lower selling fee", body: "Keep more of what you sell. The marketplace fee drops from 2% to 1% on new sales." },
  { icon: "headset", title: "Priority support", body: "Your support tickets are answered before the rest." },
  { icon: "flash", title: "Early access to deals", body: "See new food and campus deals before everyone else.", soon: true },
];

function brand(b: string | null) {
  return b ? b.charAt(0).toUpperCase() + b.slice(1) : "Card";
}

export default function PremiumScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [state, setState] = useState<State | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"card" | "wallet" | "renew" | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const waitUntil = useRef(0);

  const load = useCallback(async () => {
    if (!user) return;
    const [s, w] = await Promise.all([
      supabase.rpc("my_premium_state"),
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    ]);
    if (s.data) setState(s.data as State);
    setBalance(Number(w.data?.balance ?? 0));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmPayments = useCallback(async () => {
    const res = await callPaystack(supabase, { action: "verify-mine" });
    if (res.ok && Number(res.data.settled ?? 0) > 0) {
      setWaiting(false);
      setMessage({ ok: true, text: "Payment received. Premium is active." });
      void load();
    }
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && waitUntil.current > Date.now()) void confirmPayments();
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
    }, 5000);
    return () => clearInterval(t);
  }, [waiting, confirmPayments]);

  async function payByCard() {
    setBusy("card");
    setMessage(null);
    const res = await callPaystack(supabase, { action: "init-premium" });
    setBusy(null);
    if (res.ok && typeof res.data.authorization_url === "string") {
      waitUntil.current = Date.now() + 5 * 60 * 1000;
      setWaiting(true);
      void Linking.openURL(res.data.authorization_url);
      return;
    }
    setMessage({ ok: false, text: res.ok ? "Couldn't open the card page. Try again." : res.message });
  }

  async function payFromWallet() {
    if (!state) return;
    setBusy("wallet");
    setMessage(null);
    const { error } = await supabase.rpc("subscribe_premium");
    setBusy(null);
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: "Premium is active. Paid from your wallet." });
    void load();
  }

  async function toggleRenew() {
    if (!state) return;
    setBusy("renew");
    await supabase.rpc("set_premium_auto_renew", { p_on: !state.auto_renew });
    setBusy(null);
    void load();
  }

  const price = state?.price ?? 1000;
  const active = Boolean(state?.active);
  const ends = state?.ends_at ? new Date(state.ends_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";
  const renewLine =
    state?.auto_renew === false
      ? `Premium ends on ${ends} and will not renew.`
      : state?.pay_method === "card" && state.card
        ? `Renews on ${ends} with ${brand(state.card.brand)} •••• ${state.card.last4}.`
        : state?.pay_method === "card"
          ? `Active until ${ends}. No card was saved, so it will not renew by itself.`
          : `Renews on ${ends} from your wallet.`;

  return (
    <PageShell
      title="Premium"
      subtitle="Get more from CampusOS"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void confirmPayments();
        void load();
      }}
    >
      <View style={{ backgroundColor: colors.heroBg, borderRadius: 24, padding: 20, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AppText size={13} weight="700" style={{ color: colors.heroMuted }}>
            CAMPUSOS PREMIUM
          </AppText>
          {active ? <PremiumBadge /> : null}
        </View>
        <AppText size={34} weight="700" style={{ color: colors.heroFg }}>
          {formatNaira(price)}
          <AppText size={15} style={{ color: colors.heroMuted }}>
            {" "}
            / month
          </AppText>
        </AppText>
        <AppText size={13} style={{ color: colors.heroMuted }}>
          {active ? "Premium is active on your account." : "Cancel renewal any time. No hidden charges."}
        </AppText>
      </View>

      {active ? (
        <Notice tone="success">{renewLine}</Notice>
      ) : null}

      <Section title="What you get">
        <Group>
          {BENEFITS.map((b) => (
            <View key={b.title} style={{ flexDirection: "row", gap: 12, padding: 14, alignItems: "flex-start" }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: b.soon ? colors.accentSoft : PREMIUM_GREEN, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={b.soon ? "time-outline" : "checkmark"} size={16} color={b.soon ? colors.fg : "#fff"} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText weight="700">
                  {b.title}
                  {b.soon ? "  · Coming soon" : ""}
                </AppText>
                <AppText muted size={13}>
                  {b.body}
                </AppText>
              </View>
            </View>
          ))}
        </Group>
      </Section>

      <Section title={active ? "Extend Premium" : "Get Premium"}>
        <Button
          title={waiting ? "Waiting for your payment…" : busy === "card" ? "Opening secure checkout…" : `Pay ${formatNaira(price)} by card`}
          onPress={() => void payByCard()}
          loading={busy === "card"}
          disabled={waiting || busy !== null}
        />
        <Button
          variant="secondary"
          title={balance < price ? `Pay from wallet (${formatNaira(balance)}, add money first)` : `Pay ${formatNaira(price)} from wallet`}
          onPress={() => void payFromWallet()}
          loading={busy === "wallet"}
          disabled={balance < price || busy !== null || waiting}
        />
        {waiting ? (
          <Notice icon="time-outline">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={colors.fg} />
              <AppText size={13} style={{ flex: 1 }}>
                Finish on the card page. This screen updates the moment the payment goes through.
              </AppText>
            </View>
          </Notice>
        ) : null}
        {message ? <Notice tone={message.ok ? "success" : "danger"}>{message.text}</Notice> : null}
        <AppText size={12} muted>
          You enter your card on Paystack&apos;s secure page (Mastercard, Visa, Verve). CampusOS never sees your card number. Paying by card saves it for renewal, which you can switch off below.
        </AppText>
      </Section>

      {active ? (
        <Section title="Renewal">
          <Panel>
            <KeyValue label="Status" value="Active" />
            <KeyValue label="Ends" value={ends} />
            <KeyValue label="Pays with" value={state?.pay_method === "card" && state.card ? `${brand(state.card.brand)} •••• ${state.card.last4}` : "Wallet"} />
            <Button
              compact
              variant="secondary"
              title={state?.auto_renew ? "Stop renewing" : "Renew automatically"}
              onPress={() => void toggleRenew()}
              loading={busy === "renew"}
            />
          </Panel>
        </Section>
      ) : null}
    </PageShell>
  );
}
