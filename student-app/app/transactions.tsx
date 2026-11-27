import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { DateTimeField } from "@/src/components/date-time-picker";
import { Empty, Notice, PageShell, ScrollChips } from "@/src/components/page";
import { TxGrouped } from "@/src/components/tx-rows";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { useWalletGate, WalletLocked } from "@/src/lib/pay-auth";
import { loadTransactions, TYPE_FILTERS, type Tx } from "@/src/lib/transactions";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const PAGE = 30;

const DATE_FILTERS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function TransactionsScreen() {
  const { user } = useAuth();
  const gate = useWalletGate();
  const colors = useTheme();
  const [type, setType] = useState("all");
  const [range, setRange] = useState("all");
  const [fromDay, setFromDay] = useState<Date | null>(null);
  const [toDay, setToDay] = useState<Date | null>(null);
  const [rows, setRows] = useState<Tx[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An end date is included, so the limit is the next midnight.
  const { from, to } = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const back = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
    if (range === "today") return { from: today, to: tomorrow };
    if (range === "7") return { from: back(6), to: tomorrow };
    if (range === "30") return { from: back(29), to: tomorrow };
    if (range === "month") return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: tomorrow };
    if (range === "custom") {
      const t = toDay ? startOfDay(toDay) : null;
      return { from: fromDay ? startOfDay(fromDay) : null, to: t ? new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) : null };
    }
    return { from: null, to: null };
  }, [range, fromDay, toDay]);

  const load = useCallback(async () => {
    if (!user) return;
    const res = await loadTransactions(supabase, { type, from, to, limit: PAGE, offset: 0 });
    setError(res.error);
    setRows(res.rows);
    setMore(res.rows.length === PAGE);
    setLoading(false);
    setRefreshing(false);
  }, [user, type, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    const res = await loadTransactions(supabase, { type, from, to, limit: PAGE, offset: rows.length });
    setLoadingMore(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setRows((prev) => [...prev, ...res.rows]);
    setMore(res.rows.length === PAGE);
  }

  const totals = useMemo(() => {
    let inn = 0;
    let out = 0;
    for (const r of rows) {
      if (r.status === "failed") continue;
      if (r.amount > 0) inn += r.amount;
      else out += Math.abs(r.amount);
    }
    return { inn, out };
  }, [rows]);

  const filtered = type !== "all" || range !== "all";

  if (!gate.open) {
    return (
      <PageShell title="History">
        <WalletLocked onUnlock={() => void gate.unlock()} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="History"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <View style={[styles.summary, { backgroundColor: colors.heroBg }]}>
        <View style={{ flex: 1 }}>
          <AppText size={12} weight="600" style={{ color: colors.heroMuted }}>
            Money in
          </AppText>
          <AppText size={20} weight="700" style={{ color: "#4ade80" }}>
            +{formatNaira(totals.inn)}
          </AppText>
        </View>
        <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.15)" }]} />
        <View style={{ flex: 1 }}>
          <AppText size={12} weight="600" style={{ color: colors.heroMuted }}>
            Money out
          </AppText>
          <AppText size={20} weight="700" style={{ color: colors.heroFg }}>
            -{formatNaira(totals.out)}
          </AppText>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <ScrollChips options={TYPE_FILTERS} value={type} onChange={setType} />
        <ScrollChips options={DATE_FILTERS} value={range} onChange={setRange} />
        {range === "custom" ? (
          <View style={styles.dates}>
            <View style={{ flex: 1 }}>
              <DateTimeField label="From" value={fromDay} onChange={setFromDay} maximumDate={toDay ?? new Date()} placeholder="Any" />
            </View>
            <View style={{ flex: 1 }}>
              <DateTimeField label="To" value={toDay} onChange={setToDay} minimumDate={fromDay ?? undefined} maximumDate={new Date()} placeholder="Today" />
            </View>
          </View>
        ) : null}
      </View>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {!rows.length && !error ? (
        <Empty
          icon="receipt-outline"
          title={filtered ? "Nothing here" : "No transactions yet"}
          body={filtered ? "Try another filter." : "Top-ups, purchases and sales show here."}
        />
      ) : (
        <>
          <TxGrouped rows={rows} />
          {more ? <Button variant="secondary" title="Load more" onPress={() => void loadMore()} loading={loadingMore} /> : null}
        </>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  summary: { borderRadius: radii.xl, padding: 18, flexDirection: "row", alignItems: "center", gap: 16 },
  divider: { width: 1, alignSelf: "stretch" },
  dates: { flexDirection: "row", gap: 10 },
});
