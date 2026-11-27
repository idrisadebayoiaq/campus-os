import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Group, Notice, PageShell, Section } from "@/src/components/page";
import { PREMIUM_GREEN } from "@/src/components/premium-badge";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { notify } from "@/src/lib/feedback";
import { callPaystack } from "@/src/lib/payments";
import { PAY_RETURN_URL, usePaySheet } from "@/src/lib/pay-sheet";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type State = {
  active: boolean;
  ends_at: string | null;
  auto_renew: boolean;
  pay_method: "card" | "wallet" | null;
  card: { brand: string | null; last4: string | null; exp: string } | null;
  price: number;
  kind?: "enrolled" | "exam_prep";
};

type Benefit = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };

const EXAM_BENEFITS: Benefit[] = [
  { icon: "sparkles", title: "AI tutor", body: "Step-by-step answers and exam-style practice." },
  { icon: "document-text", title: "Past questions", body: "JAMB, WAEC and NECO, with your own notes." },
  { icon: "pricetag", title: "1% selling fee", body: "Down from 2% on the marketplace." },
  { icon: "headset", title: "Priority support", body: "Your tickets are answered first." },
];

const BENEFITS: Benefit[] = [
  { icon: "sparkles", title: "3× AI tutor limits", body: "More questions every hour and every day." },
  { icon: "pricetag", title: "1% selling fee", body: "Down from 2% on the marketplace." },
  { icon: "headset", title: "Priority support", body: "Your tickets are answered first." },
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
      if (paid.status === "success") notify("Premium is active", undefined, undefined, { tone: "success" });
      else if (paid.status === "failed") notify("Payment not completed", "Your card was not charged.", undefined, { tone: "danger" });
      void load();
      return;
    }
    notify("Couldn't start the payment", res.ok ? "Try again in a moment." : res.message, undefined, { tone: "danger" });
  }

  async function payFromWallet() {
    if (!state) return;
    setBusy("wallet");
    const { error } = await supabase.rpc("subscribe_premium");
    setBusy(null);
    if (error) notify("Couldn't activate Premium", error.message, undefined, { tone: "danger" });
    else notify("Premium is active", "Paid from your wallet.", undefined, { tone: "success" });
    void load();
  }

  async function toggleRenew() {
    if (!state) return;
    setBusy("renew");
    const { error } = await supabase.rpc("set_premium_auto_renew", { p_on: !state.auto_renew });
    setBusy(null);
    if (error) notify("Couldn't change renewal", error.message, undefined, { tone: "danger" });
    else notify(state.auto_renew ? "Auto-renew is off" : "Auto-renew is on", undefined, undefined, { tone: "success" });
    void load();
  }

  const examPrep = state?.kind === "exam_prep";
  const price = state?.price ?? (examPrep ? 4000 : 2000);
  const active = Boolean(state?.active);
  const benefits = examPrep ? EXAM_BENEFITS : BENEFITS;
  const ends = state?.ends_at
    ? new Date(state.ends_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "";
  const daysLeft = state?.ends_at ? Math.max(0, Math.ceil((new Date(state.ends_at).getTime() - Date.now()) / 86400000)) : 0;
  const payWith =
    state?.pay_method === "card" && state.card
      ? `${brand(state.card.brand)} •••• ${state.card.last4}`
      : state?.pay_method === "card"
        ? "Card"
        : "Wallet";

  return (
    <PageShell
      title="Premium"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void confirmPayments();
        void load();
      }}
    >
      {active ? (
        <View style={[styles.banner, { backgroundColor: colors.heroBg }]}>
          <View style={styles.bannerTop}>
            <View style={[styles.check, { backgroundColor: PREMIUM_GREEN }]}>
              <Ionicons name="checkmark" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size={12} weight="700" style={{ color: colors.heroMuted }}>
                ACTIVE PLAN
              </AppText>
              <AppText size={22} weight="700" style={{ color: colors.heroFg }}>
                CampusOS Premium
              </AppText>
            </View>
          </View>

          <View style={[styles.stats, { borderColor: "rgba(255,255,255,0.14)" }]}>
            <Stat label={state?.auto_renew ? "Renews" : "Ends"} value={ends} />
            <Stat label="Days left" value={String(daysLeft)} />
            <Stat label="Pays with" value={payWith} />
          </View>

          <Pressable
            onPress={() => void toggleRenew()}
            disabled={busy === "renew"}
            style={[styles.renew, { backgroundColor: "rgba(255,255,255,0.1)", opacity: busy === "renew" ? 0.6 : 1 }]}
          >
            <Ionicons name={state?.auto_renew ? "refresh-circle" : "pause-circle"} size={20} color={colors.heroFg} />
            <AppText size={14} weight="600" style={{ color: colors.heroFg, flex: 1 }}>
              {state?.auto_renew ? `Auto-renew · ${formatNaira(price)}/month` : "Auto-renew off"}
            </AppText>
            <AppText size={13} weight="700" style={{ color: colors.accent }}>
              {state?.auto_renew ? "Turn off" : "Turn on"}
            </AppText>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.banner, { backgroundColor: colors.heroBg }]}>
            <AppText size={12} weight="700" style={{ color: colors.heroMuted }}>
              CAMPUSOS PREMIUM
            </AppText>
            <AppText size={36} weight="700" style={{ color: colors.heroFg, lineHeight: 44 }}>
              {formatNaira(price)}
              <AppText size={15} style={{ color: colors.heroMuted }}>
                {" "}
                / month
              </AppText>
            </AppText>
            <AppText size={13} style={{ color: colors.heroMuted }}>
              Cancel any time.
            </AppText>
          </View>

          <Group>
            {benefits.map((b) => (
              <View key={b.title} style={styles.benefit}>
                <View style={[styles.benefitIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name={b.icon} size={18} color={colors.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="700">{b.title}</AppText>
                  <AppText muted size={13}>
                    {b.body}
                  </AppText>
                </View>
              </View>
            ))}
          </Group>

          <Section>
            <Button
              title={`Pay ${formatNaira(price)} by card`}
              onPress={() => void payWithCard()}
              loading={busy === "card"}
              disabled={busy !== null}
            />
            <Button
              variant="secondary"
              title={balance < price ? `Wallet ${formatNaira(balance)} · top up first` : `Pay from wallet (${formatNaira(balance)})`}
              onPress={() => void payFromWallet()}
              loading={busy === "wallet"}
              disabled={balance < price || busy !== null}
            />
            <Notice icon="lock-closed-outline">Card payments are handled securely by Paystack.</Notice>
          </Section>
        </>
      )}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const colors = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <AppText size={11} weight="600" style={{ color: colors.heroMuted }}>
        {label}
      </AppText>
      <AppText size={14} weight="700" numberOfLines={1} style={{ color: colors.heroFg }}>
        {value || "—"}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radii.xl, padding: 20, gap: 14 },
  bannerTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  check: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  renew: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  benefit: { flexDirection: "row", gap: 12, padding: 14, alignItems: "center" },
  benefitIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
