import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { AppText, Button, Input } from "@/src/components/ui";
import { Group, Hero, ListRow, Notice, PageShell, Panel, Section, type Tone } from "@/src/components/page";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { callPaystack } from "@/src/lib/payments";
import { supabase } from "@/src/lib/supabase";

type Account = { account_name: string; bank_name: string | null; account_number: string };
type Payout = { id: string; amount: number; status: string; failure_reason: string | null; created_at: string };
type Entry = { id: string; kind: string; amount: number; note: string | null; created_at: string };
type Bank = { name: string; code: string };

const KIND: Record<string, string> = {
  sale: "Sale",
  commission: "CampusOS commission",
  refund: "Refund",
  payout: "Withdrawal",
  payout_reversal: "Withdrawal returned",
  adjust: "Adjustment",
};

export default function EarningsScreen() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [minimum, setMinimum] = useState(5000);
  const [account, setAccount] = useState<Account | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankQuery, setBankQuery] = useState("");
  const [bank, setBank] = useState<Bank | null>(null);
  const [number, setNumber] = useState("");
  const [found, setFound] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [bal, acc, pay, ent, min] = await Promise.all([
      supabase.rpc("my_earnings"),
      supabase.from("user_payout_accounts").select("account_name, bank_name, account_number").eq("user_id", user.id).maybeSingle(),
      supabase.from("payouts").select("id, amount, status, failure_reason, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("user_entries").select("id, kind, amount, note, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(40),
      supabase.rpc("setting_num", { p_key: "payout_min", p_default: 5000 }),
    ]);
    setBalance(Number(bal.data ?? 0));
    setAccount((acc.data as Account | null) ?? null);
    setPayouts((pay.data as Payout[]) ?? []);
    setEntries((ent.data as Entry[]) ?? []);
    setMinimum(Number(min.data ?? 5000));
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startEditing() {
    setEditing(true);
    setFound(null);
    if (!banks.length) {
      const res = await callPaystack(supabase, { action: "banks" });
      if (res.ok) setBanks((res.data.banks as Bank[]) ?? []);
      else Alert.alert("Banks unavailable", res.message);
    }
  }

  async function check() {
    if (!bank || number.replace(/\D/g, "").length !== 10) {
      Alert.alert("Check your details", "Choose your bank and enter your 10-digit account number.");
      return;
    }
    setBusy(true);
    const res = await callPaystack(supabase, { action: "resolve-bank", bank_code: bank.code, account_number: number });
    setBusy(false);
    if (!res.ok) {
      Alert.alert("Couldn't check this account", res.message);
      return;
    }
    setFound(String(res.data.account_name));
  }

  async function confirm() {
    if (!bank) return;
    setBusy(true);
    const res = await callPaystack(supabase, { action: "verify-bank", bank_code: bank.code, account_number: number });
    setBusy(false);
    if (!res.ok) {
      Alert.alert("Couldn't save", res.message);
      return;
    }
    setEditing(false);
    setFound(null);
    setNumber("");
    void load();
  }

  function withdraw() {
    Alert.alert("Withdraw to your bank?", `${formatNaira(balance)} will be sent to ${account?.account_name} (${account?.bank_name}).`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Withdraw",
        onPress: async () => {
          setBusy(true);
          const res = await callPaystack(supabase, { action: "payout" });
          setBusy(false);
          Alert.alert(res.ok ? "Withdrawal started" : "Couldn't withdraw", res.ok ? "It usually reaches your bank within minutes." : res.message);
          void load();
        },
      },
    ]);
  }

  const open = payouts.some((p) => p.status === "requested" || p.status === "processing");
  const canWithdraw = !!account && !open && balance >= minimum;
  const filtered = bankQuery.trim() ? banks.filter((b) => b.name.toLowerCase().includes(bankQuery.trim().toLowerCase())).slice(0, 6) : [];

  const payoutTone = (s: string): Tone => (s === "paid" ? "success" : s === "failed" ? "danger" : "neutral");
  const payoutLabel = (s: string) => (s === "paid" ? "Paid" : s === "failed" ? "Failed, returned" : "On its way");

  return (
    <PageShell
      title="My earnings"
      subtitle="Money from your marketplace sales"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      footer={
        <>
          <Button
            title={open ? "Withdrawal on its way" : `Withdraw ${formatNaira(balance)}`}
            onPress={withdraw}
            disabled={!canWithdraw}
            loading={busy && !editing}
          />
          <AppText size={12} muted style={{ textAlign: "center", marginTop: 8 }}>
            {!account
              ? "Add your bank account to withdraw."
              : balance < minimum
                ? `You can withdraw once your earnings reach ${formatNaira(minimum)}.`
                : "Paid to your own bank account."}
          </AppText>
        </>
      }
    >
      <Hero
        label="Available to withdraw"
        value={formatNaira(balance)}
        note="Released after buyers confirm the handover, after CampusOS takes its small commission."
      />

      <Section title="Bank account" hint="Withdrawals only go to an account in your own name">
        {account && !editing ? (
          <Group>
            <ListRow
              icon="business-outline"
              title={account.account_name}
              subtitle={`${account.bank_name ?? "Bank"} · ••••${account.account_number.slice(-4)}`}
              onPress={() => void startEditing()}
              right={
                <AppText size={13} weight="700">
                  Change
                </AppText>
              }
              chevron={false}
            />
          </Group>
        ) : null}
        {!account && !editing ? <Button title="Add bank account" onPress={() => void startEditing()} /> : null}
        {editing ? (
          <Panel>
            <Input
              value={bank ? bank.name : bankQuery}
              onChangeText={(t) => {
                setBank(null);
                setBankQuery(t);
                setFound(null);
              }}
              placeholder="Search your bank"
            />
            {!bank && filtered.length ? (
              <Group>
                {filtered.map((b) => (
                  <ListRow key={b.code} title={b.name} onPress={() => setBank(b)} chevron={false} />
                ))}
              </Group>
            ) : null}
            <Input
              value={number}
              onChangeText={(t) => {
                setNumber(t);
                setFound(null);
              }}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="10-digit account number"
            />
            {found ? (
              <>
                <Notice tone="success" icon="person-circle-outline">
                  {`This account belongs to ${found}. Is it yours?`}
                </Notice>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button compact title="Yes, save it" onPress={() => void confirm()} loading={busy} style={{ flex: 1 }} />
                  <Button compact variant="secondary" title="No" onPress={() => setFound(null)} style={{ flex: 1 }} />
                </View>
              </>
            ) : (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button compact title="Check account" onPress={() => void check()} loading={busy} style={{ flex: 1 }} />
                <Button compact variant="secondary" title="Cancel" onPress={() => setEditing(false)} style={{ flex: 1 }} />
              </View>
            )}
          </Panel>
        ) : null}
      </Section>

      {payouts.length ? (
        <Section title="Withdrawals">
          <Group>
            {payouts.map((p) => (
              <ListRow
                key={p.id}
                title={formatNaira(p.amount)}
                subtitle={new Date(p.created_at).toLocaleDateString()}
                value={payoutLabel(p.status)}
                valueTone={payoutTone(p.status)}
              />
            ))}
          </Group>
        </Section>
      ) : null}

      {entries.length ? (
        <Section title="History">
          <Group>
            {entries.map((e) => (
              <ListRow
                key={e.id}
                title={KIND[e.kind] ?? e.kind}
                subtitle={`${e.note ? `${e.note} · ` : ""}${new Date(e.created_at).toLocaleDateString()}`}
                value={`${Number(e.amount) > 0 ? "+" : "-"}${formatNaira(Math.abs(Number(e.amount)))}`}
                valueTone={Number(e.amount) > 0 ? "success" : "neutral"}
              />
            ))}
          </Group>
        </Section>
      ) : null}
    </PageShell>
  );
}
