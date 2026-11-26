import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { ChipRow, Group, Hero, KeyValue, ListRow, Notice, PageShell, Panel, Section } from "@/src/components/page";
import { AppText, Button, Input } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { callPaystack } from "@/src/lib/payments";
import { supabase } from "@/src/lib/supabase";
import { notify } from "@/src/lib/feedback";

type Summary = {
  available: number;
  on_hold: number;
  minimum: number;
  move_minimum: number;
  withdrawal_open: boolean;
  bank: { name: string; bank: string | null; last4: string } | null;
  wallet_balance: number;
  wallet_cap: number;
};

export default function PayoutScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ to?: string }>();
  const [to, setTo] = useState<"bank" | "wallet">(params.to === "bank" ? "bank" : "wallet");
  const [s, setS] = useState<Summary | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc("my_seller_summary");
    if (data) {
      const d = data as Summary;
      setS({
        ...d,
        available: Number(d.available),
        on_hold: Number(d.on_hold),
        minimum: Number(d.minimum),
        move_minimum: Number(d.move_minimum),
        wallet_balance: Number(d.wallet_balance),
        wallet_cap: Number(d.wallet_cap),
      });
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const available = s?.available ?? 0;
  const typed = Math.round(Number(amount.replace(/[^0-9]/g, "")) || 0);
  const walletAmount = amount.trim() ? typed : available;

  const walletProblem = !s
    ? null
    : available <= 0
      ? "You have no earnings to move yet."
      : walletAmount < s.move_minimum
        ? `The smallest amount you can move is ${formatNaira(s.move_minimum)}.`
        : walletAmount > available
          ? `You only have ${formatNaira(available)} available.`
          : s.wallet_balance + walletAmount > s.wallet_cap
            ? `Your wallet can hold up to ${formatNaira(s.wallet_cap)}. Move a smaller amount.`
            : null;

  const bankProblem = !s
    ? null
    : !s.bank
      ? "Add your bank account first."
      : s.withdrawal_open
        ? "A withdrawal is already on its way."
        : available < s.minimum
          ? `You can withdraw to your bank once your earnings reach ${formatNaira(s.minimum)}.`
          : null;

  async function moveToWallet() {
    if (walletProblem || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    const { error: e } = await supabase.rpc("move_earnings_to_wallet", { p_amount: amount.trim() ? walletAmount : null });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    setAmount("");
    setDone(`${formatNaira(walletAmount)} is now in your wallet and ready to spend.`);
    void load();
  }

  function withdrawToBank() {
    if (bankProblem || !s?.bank) return;
    notify("Withdraw to your bank?", `${formatNaira(available)} will be sent to ${s.bank.name} (${s.bank.bank ?? "bank"} ••••${s.bank.last4}).`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Withdraw",
        onPress: async () => {
          setBusy(true);
          setError(null);
          setDone(null);
          const res = await callPaystack(supabase, { action: "payout" });
          setBusy(false);
          if (!res.ok) setError(res.message);
          else setDone("Withdrawal started. It usually reaches your bank within minutes.");
          void load();
        },
      },
    ]);
  }

  const quick = [1000, 2000, 5000].filter((n) => n < available);

  return (
    <PageShell
      title="Request payout"
      subtitle="Take your marketplace earnings out"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      footer={
        to === "wallet" ? (
          <Button
            title={walletProblem ? "Move to wallet" : `Move ${formatNaira(walletAmount)} to wallet`}
            onPress={() => void moveToWallet()}
            disabled={!!walletProblem}
            loading={busy}
          />
        ) : (
          <Button
            title={bankProblem ? "Withdraw to bank" : `Withdraw ${formatNaira(available)} to bank`}
            onPress={withdrawToBank}
            disabled={!!bankProblem}
            loading={busy}
          />
        )
      }
    >
      <Hero
        label="Available to withdraw"
        value={formatNaira(available)}
        note={s && s.on_hold > 0 ? `${formatNaira(s.on_hold)} more is on hold until buyers confirm their handover.` : "Money from sales is added here after the buyer confirms the handover."}
      />

      <Section title="Where should it go?">
        <ChipRow
          options={[
            { value: "wallet", label: "My wallet" },
            { value: "bank", label: "My bank account" },
          ]}
          value={to}
          onChange={(v) => {
            setTo(v as "bank" | "wallet");
            setError(null);
            setDone(null);
          }}
        />
      </Section>

      {to === "wallet" ? (
        <Section title="Amount" hint="Instant, no fee. Spend it on food, marketplace, rent and Premium.">
          {quick.length ? (
            <ChipRow
              options={[{ value: "", label: `All ${formatNaira(available)}` }, ...quick.map((n) => ({ value: String(n), label: formatNaira(n) }))]}
              value={amount}
              onChange={setAmount}
            />
          ) : null}
          <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder={`Amount (leave empty for all ${formatNaira(available)})`} />
          {s ? (
            <Panel>
              <KeyValue label="Moving" value={formatNaira(walletProblem ? 0 : walletAmount)} />
              <KeyValue label="Wallet now" value={formatNaira(s.wallet_balance)} />
              <KeyValue label="Wallet after" value={formatNaira(s.wallet_balance + (walletProblem ? 0 : walletAmount))} strong />
            </Panel>
          ) : null}
          {walletProblem && available > 0 ? <Notice tone="danger">{walletProblem}</Notice> : null}
          {available <= 0 ? <Notice icon="information-circle-outline">{walletProblem}</Notice> : null}
          <AppText size={12} muted>
            Money moved to your wallet can only be spent inside CampusOS. To get cash, withdraw to your bank instead.
          </AppText>
        </Section>
      ) : (
        <Section title="Bank account" hint="Withdrawals only go to an account in your own name. The whole available amount is sent.">
          {s?.bank ? (
            <Group>
              <ListRow
                icon="business-outline"
                title={s.bank.name}
                subtitle={`${s.bank.bank ?? "Bank"} · ••••${s.bank.last4}`}
                onPress={() => router.push("/earnings")}
                right={
                  <AppText size={13} weight="700">
                    Change
                  </AppText>
                }
                chevron={false}
              />
            </Group>
          ) : (
            <Button variant="secondary" title="Add bank account" onPress={() => router.push("/earnings")} />
          )}
          {bankProblem && s?.bank ? <Notice icon="information-circle-outline">{bankProblem}</Notice> : null}
          {!s?.bank ? <Notice icon="information-circle-outline">Add your bank account to withdraw. It takes a minute.</Notice> : null}
          <View style={{ gap: 2 }}>
            <AppText size={12} muted>
              Sent to your bank within minutes. If it fails, the money comes straight back to your earnings.
            </AppText>
          </View>
        </Section>
      )}

      {done ? <Notice tone="success">{done}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </PageShell>
  );
}
