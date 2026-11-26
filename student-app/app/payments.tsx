import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { AppText, Button, EmptyState } from "@/src/components/ui";
import { Hero, Notice, PageShell, Panel, Pill, Section, type Tone } from "@/src/components/page";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { supabase } from "@/src/lib/supabase";

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

const STATUS: Record<string, { label: string; tone: Tone }> = {
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export default function PaymentRequestsScreen() {
  const { user } = useAuth();
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

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");
  const owed = pending.reduce((sum, r) => sum + Number(r.amount), 0);

  function card(r: Request) {
    const biz = Array.isArray(r.business_profiles) ? r.business_profiles[0] : r.business_profiles;
    const st = STATUS[r.status];
    return (
      <Panel key={r.id}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText weight="700">{r.title}</AppText>
            <AppText muted size={13}>
              {biz?.display_name ?? "Provider"} · {KIND[r.kind] ?? "Payment"}
            </AppText>
            {r.due_on ? (
              <AppText muted size={12}>
                Due {new Date(r.due_on).toLocaleDateString()}
              </AppText>
            ) : null}
          </View>
          <AppText weight="700" size={17}>
            {formatNaira(r.amount)}
          </AppText>
        </View>
        {r.status === "pending" ? (
          <Button compact title="Pay from wallet" onPress={() => pay(r)} loading={busy === r.id} />
        ) : st ? (
          <Pill label={st.label} tone={st.tone} />
        ) : null}
      </Panel>
    );
  }

  return (
    <PageShell
      title="Payment requests"
      subtitle="Rent, deposits and fees sent to you"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Hero
        label="Waiting for you"
        value={formatNaira(owed)}
        note={`Wallet balance ${formatNaira(balance)}${pending.length ? ` · ${pending.length} to pay` : ""}`}
      />

      {!rows.length ? (
        <EmptyState title="No payment requests" description="Rent, deposits and fees your landlord or a service sends you appear here." />
      ) : null}

      {pending.length ? (
        <Section title="To pay">
          {owed > balance ? <Notice tone="warn">{`Your wallet is short by ${formatNaira(owed - balance)} for everything below.`}</Notice> : null}
          {pending.map(card)}
        </Section>
      ) : null}

      {done.length ? <Section title="Earlier">{done.map(card)}</Section> : null}
    </PageShell>
  );
}
