import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Group, KeyValue, Notice, PageShell, Panel, Section } from "@/src/components/page";
import { PremiumBadge, PREMIUM_GREEN } from "@/src/components/premium-badge";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { notify } from "@/src/lib/feedback";
import { callPaystack } from "@/src/lib/payments";
import { PAY_RETURN_URL, usePaySheet } from "@/src/lib/pay-sheet";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

type State = {
  active: boolean;
  ends_at: string | null;
  auto_renew: boolean;
  pay_method: "card" | "wallet" | null;
  card: { brand: string | null; last4: string | null; exp: string } | null;
  price: number;
  kind?: "enrolled" | "exam_prep";
};

type Benefit = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; soon?: boolean };

const EXAM_BENEFITS: Benefit[] = [
  { icon: "sparkles", title: "AI tutor for your exam", body: "Ask your tutor anything, get step-by-step answers and exam-style practice questions, any time." },
  { icon: "document-text", title: "Past questions", body: "Practise with JAMB, WAEC and NECO past questions and keep your own notes. More added all the time." },
  { icon: "checkmark-circle", title: "Green Premium badge", body: "Shown next to your name on your profile, chats and marketplace listings." },
  { icon: "pricetag", title: "Lower selling fee", body: "Keep more of what you sell. The marketplace fee drops from 2% to 1% on new sales." },
  { icon: "headset", title: "Priority support", body: "Your support tickets are answered before the rest." },
];

const BENEFITS: Benefit[] = [
  { icon: "checkmark-circle", title: "Green Premium badge", body: "Shown next to your name on your profile, chats and marketplace listings." },
  { icon: "sparkles", title: "Higher AI tutor limits", body: "The tutor is free for you with a daily limit. Premium gives you three times more questions every hour and every day." },
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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const { payByCard } = usePaySheet();

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

  // Settle any payment that finished while the app was closed (pull to refresh).
  const confirmPayments = useCallback(async () => {
    const res = await callPaystack(supabase, { action: "verify-mine" });
    if (res.ok && Number(res.data.settled ?? 0) > 0) void load();
  }, [load]);

  async function payWithCard() {
    setBusy("card");
    setMessage(null);
    const res = await callPaystack(supabase, { action: "init-premium", callback_url: PAY_RETURN_URL });
    setBusy(null);
    if (res.ok && typeof res.data.authorization_url === "string" && typeof res.data.reference === "string") {
      const paid = await payByCard({
        url: res.data.authorization_url,
        reference: res.data.reference,
        title: "CampusOS Premium",
        amount: price,
        successText: "Premium is now active on your account.",
      });
      if (paid.status === "success") notify("Premium is active", "Enjoy your green badge and higher limits.", undefined, { tone: "success" });
      else if (paid.status === "failed") notify("Payment not completed", "Your card was not charged. Try again or use another card.", undefined, { tone: "danger" });
      void load();
      return;
    }
    notify("Couldn't start the payment", res.ok ? "Try again in a moment." : res.message, undefined, { tone: "danger" });
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

  const examPrep = state?.kind === "exam_prep";
  const price = state?.price ?? (examPrep ? 4000 : 2000);
  const active = Boolean(state?.active);
  const benefits = examPrep ? EXAM_BENEFITS : BENEFITS;
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
          {active
            ? "Premium is active on your account."
            : examPrep
              ? "Unlocks the AI tutor and past questions. Everything else in CampusOS is already free for you."
              : "Cancel renewal any time. No hidden charges."}
        </AppText>
      </View>

      {active ? (
        <Notice tone="success">{renewLine}</Notice>
      ) : null}

      <Section title="What you get">
        <Group>
          {benefits.map((b) => (
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
          title={busy === "card" ? "Preparing secure checkout…" : `Pay ${formatNaira(price)} by card`}
          onPress={() => void payWithCard()}
          loading={busy === "card"}
          disabled={busy !== null}
        />
        <Button
          variant="secondary"
          title={balance < price ? `Pay from wallet (${formatNaira(balance)}, add money first)` : `Pay ${formatNaira(price)} from wallet`}
          onPress={() => void payFromWallet()}
          loading={busy === "wallet"}
          disabled={balance < price || busy !== null}
        />
        {message ? <Notice tone={message.ok ? "success" : "danger"}>{message.text}</Notice> : null}
        <AppText size={12} muted>
          You enter your card on Paystack&apos;s secure form inside this app (Mastercard, Visa, Verve). CampusOS never sees your card number. Paying by card saves it for renewal, which you can switch off below.
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
