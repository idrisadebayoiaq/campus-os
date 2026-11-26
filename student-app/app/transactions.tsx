import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { ChipRow, Notice, PageShell, Panel, Section } from "@/src/components/page";
import { TxGrouped } from "@/src/components/tx-rows";
import { AppText, Button, EmptyState, Input } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { loadTransactions, TYPE_FILTERS, type Tx } from "@/src/lib/transactions";
import { supabase } from "@/src/lib/supabase";

const PAGE = 30;

const DATE_FILTERS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Pick dates" },
];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDay(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? null : d;
}

export default function TransactionsScreen() {
  const { user } = useAuth();
  const [type, setType] = useState("all");
  const [range, setRange] = useState("all");
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [rows, setRows] = useState<Tx[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Work out the dates once per choice (an end date is included, so the limit is the next midnight).
  const { from, to, dateProblem } = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (range === "today") return { from: today, to: tomorrow, dateProblem: null };
    if (range === "7") return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6), to: tomorrow, dateProblem: null };
    if (range === "30") return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29), to: tomorrow, dateProblem: null };
    if (range === "month") return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: tomorrow, dateProblem: null };
    if (range === "custom") {
      const f = fromText.trim() ? parseDay(fromText) : null;
      const t = toText.trim() ? parseDay(toText) : null;
      if (fromText.trim() && !f) return { from: null, to: null, dateProblem: "Write the start date like 2026-11-01." };
      if (toText.trim() && !t) return { from: null, to: null, dateProblem: "Write the end date like 2026-11-30." };
      if (f && t && f > t) return { from: null, to: null, dateProblem: "The start date must come before the end date." };
      return { from: f, to: t ? new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) : null, dateProblem: null };
    }
    return { from: null, to: null, dateProblem: null };
  }, [range, fromText, toText]);

  const load = useCallback(async () => {
    if (!user || dateProblem) return;
    const res = await loadTransactions(supabase, { type, from, to, limit: PAGE, offset: 0 });
    setError(res.error);
    setRows(res.rows);
    setMore(res.rows.length === PAGE);
    setLoading(false);
    setRefreshing(false);
  }, [user, type, from, to, dateProblem]);

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

  const filtered = type !== "all" || range !== "all";

  return (
    <PageShell
      title="Transactions"
      subtitle="Everything that came in or went out"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Section title="Type">
        <ChipRow options={TYPE_FILTERS} value={type} onChange={setType} />
      </Section>

      <Section title="Date">
        <ChipRow options={DATE_FILTERS} value={range} onChange={setRange} />
        {range === "custom" ? (
          <Panel>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText size={12} muted>
                  From
                </AppText>
                <Input value={fromText} onChangeText={setFromText} placeholder="2026-11-01" keyboardType="numbers-and-punctuation" maxLength={10} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <AppText size={12} muted>
                  To
                </AppText>
                <Input value={toText} onChangeText={setToText} placeholder="2026-11-30" keyboardType="numbers-and-punctuation" maxLength={10} />
              </View>
            </View>
            {dateProblem ? <Notice tone="danger">{dateProblem}</Notice> : <AppText size={12} muted>Leave one empty to have no limit on that side.</AppText>}
          </Panel>
        ) : null}
      </Section>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {!rows.length && !error ? (
        <EmptyState
          title={filtered ? "Nothing matches these filters" : "No transactions yet"}
          description={filtered ? "Try another type or a wider date range." : "Top-ups, purchases, sales and withdrawals will show up here."}
        />
      ) : (
        <>
          <TxGrouped rows={rows} />
          {more ? <Button variant="secondary" title="Show more" onPress={() => void loadMore()} loading={loadingMore} /> : null}
          {!more && rows.length ? (
            <AppText muted size={12} style={{ textAlign: "center" }}>
              That's everything{filtered ? " for these filters" : ""}.
            </AppText>
          ) : null}
        </>
      )}
    </PageShell>
  );
}
