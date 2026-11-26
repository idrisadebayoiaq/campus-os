import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Check = { label: string; done: boolean };
type Receipt = { id: string; amount: number; paid_on: string; receipt_no: string; method: string | null };
type Tenancy = {
  id: string;
  rent_amount: number;
  rent_period: string;
  start_date: string;
  end_date: string | null;
  next_due_on: string | null;
  status: string;
  checklist: Check[];
  property_units: { title: string } | { title: string }[] | null;
  business_profiles: { display_name: string } | { display_name: string }[] | null;
  rent_receipts: Receipt[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "–");

export default function MyRoomScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Tenancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("tenancies")
      .select(
        "id, rent_amount, rent_period, start_date, end_date, next_due_on, status, checklist, property_units(title), business_profiles(display_name), rent_receipts(id, amount, paid_on, receipt_no, method)",
      )
      .eq("student_id", user.id)
      .in("status", ["upcoming", "active", "ended"])
      .order("start_date", { ascending: false });
    setRows((data as unknown as Tenancy[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(t: Tenancy, index: number) {
    const next = t.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c));
    setRows((r) => r.map((x) => (x.id === t.id ? { ...x, checklist: next } : x)));
    const { error } = await supabase.rpc("set_tenancy_checklist", { p_tenancy: t.id, p_checklist: next });
    if (error) void load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          My room
        </AppText>
        <View style={{ width: 40 }} />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.fg} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          {rows.length === 0 ? (
            <EmptyState
              title="No tenancy yet"
              description="When your agent adds you as a tenant, your rent dates, move-in checklist and receipts show up here."
            />
          ) : (
            rows.map((t) => {
              const done = t.checklist.filter((c) => c.done).length;
              const receipts = [...(t.rent_receipts ?? [])].sort((a, b) => b.paid_on.localeCompare(a.paid_on));
              const overdue = t.status === "active" && t.next_due_on && new Date(t.next_due_on) < new Date();
              return (
                <View key={t.id} style={[styles.card, { backgroundColor: colors.surface }]}>
                  <AppText size={17} weight="700">
                    {one(t.property_units)?.title ?? "Your room"}
                  </AppText>
                  <AppText size={12} muted>
                    {one(t.business_profiles)?.display_name ?? "Your agent"} · {t.status}
                  </AppText>
                  <View style={styles.stats}>
                    <View style={{ flex: 1 }}>
                      <AppText size={11} muted>
                        Rent / {t.rent_period}
                      </AppText>
                      <AppText weight="700">{formatNaira(Number(t.rent_amount))}</AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText size={11} muted>
                        Next due
                      </AppText>
                      <AppText weight="700" style={overdue ? { color: colors.danger } : undefined}>
                        {day(t.next_due_on)}
                      </AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText size={11} muted>
                        Since
                      </AppText>
                      <AppText weight="700">{day(t.start_date)}</AppText>
                    </View>
                  </View>

                  {t.checklist.length ? (
                    <View style={{ gap: 8 }}>
                      <AppText weight="700">
                        Move-in checklist ({done}/{t.checklist.length})
                      </AppText>
                      {t.checklist.map((c, i) => (
                        <Pressable key={`${c.label}-${i}`} onPress={() => void toggle(t, i)} style={styles.check}>
                          <Ionicons name={c.done ? "checkbox" : "square-outline"} size={22} color={c.done ? colors.success : colors.muted} />
                          <AppText style={{ flex: 1, textDecorationLine: c.done ? "line-through" : "none" }} muted={c.done}>
                            {c.label}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  <View style={{ gap: 6 }}>
                    <AppText weight="700">Rent receipts</AppText>
                    {receipts.length === 0 ? (
                      <AppText size={13} muted>
                        No payments recorded yet. Your agent adds a receipt when you pay.
                      </AppText>
                    ) : (
                      receipts.map((r) => (
                        <View key={r.id} style={styles.receipt}>
                          <View style={{ flex: 1 }}>
                            <AppText size={13} weight="600">
                              {formatNaira(Number(r.amount))}
                            </AppText>
                            <AppText size={11} muted>
                              {r.receipt_no} · {day(r.paid_on)}
                              {r.method ? ` · ${r.method}` : ""}
                            </AppText>
                          </View>
                          <Ionicons name="receipt-outline" size={18} color={colors.muted} />
                        </View>
                      ))
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radii.lg, padding: 16, gap: 14 },
  stats: { flexDirection: "row", gap: 10 },
  check: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 },
  receipt: { flexDirection: "row", alignItems: "center", gap: 10 },
});
