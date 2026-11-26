import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { callPaystack } from "@/src/lib/payments";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Account = { account_name: string; bank_name: string | null; account_number: string };
type Payout = { id: string; amount: number; status: string; failure_reason: string | null; created_at: string };
type Entry = { id: string; kind: string; amount: number; note: string | null; created_at: string };
type Bank = { name: string; code: string };

const KIND: Record<string, string> = { sale: "Sale", commission: "CampusOS commission", refund: "Refund", payout: "Withdrawal", payout_reversal: "Withdrawal returned", adjust: "Adjustment" };

export default function EarningsScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
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
  const canWithdraw = !!account && !open && balance >= minimum && !busy;
  const filtered = bankQuery.trim() ? banks.filter((b) => b.name.toLowerCase().includes(bankQuery.trim().toLowerCase())).slice(0, 6) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          My earnings
        </AppText>
        <View style={{ width: 40 }} />
      </View>
      {loading ? (
        <ActivityIndicator color={colors.fg} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          <View style={[styles.balanceCard, { backgroundColor: colors.inverseBg }]}>
            <AppText size={12} style={{ color: colors.inverseFg, opacity: 0.7 }}>
              Money you earned selling
            </AppText>
            <AppText size={34} weight="700" style={{ color: colors.inverseFg }}>
              {formatNaira(balance)}
            </AppText>
            <AppText size={12} style={{ color: colors.inverseFg, opacity: 0.7 }}>
              Released after buyers confirm the handover. Withdraw to your own bank from {formatNaira(minimum)}.
            </AppText>
          </View>

          <View style={{ gap: 8 }}>
            <AppText weight="700">Bank account</AppText>
            {account && !editing ? (
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <AppText weight="600">{account.account_name}</AppText>
                <AppText size={12} muted>
                  {account.bank_name} · ••••{account.account_number.slice(-4)}
                </AppText>
                <Pressable onPress={() => void startEditing()} hitSlop={8}>
                  <AppText size={13} weight="700">
                    Change account
                  </AppText>
                </Pressable>
              </View>
            ) : null}
            {!account && !editing ? (
              <Pressable onPress={() => void startEditing()} style={[styles.cta, { backgroundColor: colors.inverseBg }]}>
                <AppText weight="700" style={{ color: colors.inverseFg }}>
                  Add bank account
                </AppText>
              </Pressable>
            ) : null}
            {editing ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={bank ? bank.name : bankQuery}
                  onChangeText={(t) => {
                    setBank(null);
                    setBankQuery(t);
                    setFound(null);
                  }}
                  placeholder="Search your bank"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { color: colors.fg, borderColor: colors.border, backgroundColor: colors.surface }]}
                />
                {!bank
                  ? filtered.map((b) => (
                      <Pressable key={b.code} onPress={() => setBank(b)} style={[styles.card, { backgroundColor: colors.surface }]}>
                        <AppText>{b.name}</AppText>
                      </Pressable>
                    ))
                  : null}
                <TextInput
                  value={number}
                  onChangeText={(t) => {
                    setNumber(t);
                    setFound(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={10}
                  placeholder="10-digit account number"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { color: colors.fg, borderColor: colors.border, backgroundColor: colors.surface }]}
                />
                {found ? (
                  <View style={[styles.card, { backgroundColor: colors.surface }]}>
                    <AppText>
                      This account belongs to <AppText weight="700">{found}</AppText>. Is it yours?
                    </AppText>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable onPress={() => void confirm()} disabled={busy} style={[styles.btn, { backgroundColor: colors.inverseBg }]}>
                        <AppText weight="700" size={13} style={{ color: colors.inverseFg }}>
                          {busy ? "Saving…" : "Yes, save it"}
                        </AppText>
                      </Pressable>
                      <Pressable onPress={() => setFound(null)} style={[styles.btn, { borderColor: colors.border, borderWidth: 1 }]}>
                        <AppText weight="700" size={13}>
                          No
                        </AppText>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable onPress={() => void check()} disabled={busy} style={[styles.btn, { backgroundColor: colors.inverseBg, opacity: busy ? 0.5 : 1 }]}>
                      <AppText weight="700" size={13} style={{ color: colors.inverseFg }}>
                        {busy ? "Checking…" : "Check account"}
                      </AppText>
                    </Pressable>
                    <Pressable onPress={() => setEditing(false)} style={[styles.btn, { borderColor: colors.border, borderWidth: 1 }]}>
                      <AppText weight="700" size={13}>
                        Cancel
                      </AppText>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}
          </View>

          <Pressable onPress={withdraw} disabled={!canWithdraw} style={[styles.cta, { backgroundColor: colors.inverseBg, opacity: canWithdraw ? 1 : 0.4 }]}>
            <AppText weight="700" style={{ color: colors.inverseFg }}>
              {busy ? "Please wait…" : `Withdraw ${formatNaira(balance)}`}
            </AppText>
          </Pressable>
          {!account ? (
            <AppText size={12} muted>
              Add your bank account to withdraw.
            </AppText>
          ) : open ? (
            <AppText size={12} muted>
              A withdrawal is on its way.
            </AppText>
          ) : balance < minimum ? (
            <AppText size={12} muted>
              You can withdraw once your earnings reach {formatNaira(minimum)}.
            </AppText>
          ) : null}

          {payouts.length ? (
            <View style={{ gap: 8 }}>
              <AppText weight="700">Withdrawals</AppText>
              {payouts.map((p) => (
                <View key={p.id} style={[styles.row, { backgroundColor: colors.surface }]}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="600">{formatNaira(p.amount)}</AppText>
                    <AppText size={12} muted>
                      {new Date(p.created_at).toLocaleDateString()}
                    </AppText>
                  </View>
                  <AppText size={13} style={{ color: p.status === "failed" ? colors.danger : colors.muted }}>
                    {p.status === "paid" ? "Paid" : p.status === "failed" ? "Failed, returned" : "On its way"}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          {entries.length ? (
            <View style={{ gap: 8 }}>
              <AppText weight="700">History</AppText>
              {entries.map((e) => (
                <View key={e.id} style={[styles.row, { backgroundColor: colors.surface }]}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="600">{KIND[e.kind] ?? e.kind}</AppText>
                    <AppText size={12} muted numberOfLines={1}>
                      {e.note ? `${e.note} · ` : ""}
                      {new Date(e.created_at).toLocaleDateString()}
                    </AppText>
                  </View>
                  <AppText weight="700" style={{ color: Number(e.amount) > 0 ? colors.fg : colors.muted }}>
                    {Number(e.amount) > 0 ? "+" : "-"}
                    {formatNaira(Math.abs(Number(e.amount)))}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  balanceCard: { borderRadius: radii.lg ?? radii.md, padding: 20, gap: 6 },
  card: { borderRadius: radii.md, padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  input: { height: 46, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12, fontSize: 14 },
  cta: { height: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  btn: { height: 40, borderRadius: radii.pill, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
});
