import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { pickAndUploadEvidence } from "@/src/lib/evidence";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Order = {
  id: string;
  title: string;
  buyer_id: string;
  seller_user_id: string | null;
  seller_business_id: string | null;
  amount: number;
  status: string;
  accept_by: string;
  handover_by: string | null;
  release_at: string | null;
  cancel_requested_by: string | null;
  cancel_note: string | null;
  dispute_reason: string | null;
  ruling: string | null;
  ruling_note: string | null;
  created_at: string;
};

type Panel = { id: string; mode: "handover" | "confirm" | "dispute" | "cancel" } | null;

const COLUMNS =
  "id, title, buyer_id, seller_user_id, seller_business_id, amount, status, accept_by, handover_by, release_at, cancel_requested_by, cancel_note, dispute_reason, ruling, ruling_note, created_at";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

function statusLine(o: Order, buying: boolean) {
  switch (o.status) {
    case "awaiting_seller":
      return buying ? `Waiting for the seller to accept (by ${when(o.accept_by)})` : `Accept by ${when(o.accept_by)} or the buyer is refunded`;
    case "accepted":
      if (o.cancel_requested_by === "buyer") return buying ? "You asked to cancel. Waiting for the seller." : "The buyer wants to cancel";
      return buying ? `Accepted. Meet the seller by ${when(o.handover_by)}` : `Accepted. Hand over by ${when(o.handover_by)}`;
    case "seller_confirmed":
      return buying
        ? `Seller says it was handed over. Confirm or dispute before ${when(o.release_at)}, then payment is released`
        : `Waiting for the buyer. Payment releases on ${when(o.release_at)}`;
    case "completed":
      return buying ? "Done. Payment released to the seller" : "Done. Payment released to you";
    case "cancelled":
      return "Cancelled and refunded";
    case "declined":
      return "Declined and refunded";
    case "expired":
      return "Expired and refunded";
    case "disputed":
      return "In dispute. CampusOS is reviewing";
    case "resolved":
      return `Decided: ${o.ruling === "release" ? "paid the seller" : o.ruling === "refund" ? "refunded the buyer" : "split"}${o.ruling_note ? ` · ${o.ruling_note}` : ""}`;
    default:
      return o.status;
  }
}

export default function MarketOrdersScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<Order[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"buying" | "selling">("buying");
  const [panel, setPanel] = useState<Panel>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("market_orders")
      .select(COLUMNS)
      .or(`buyer_id.eq.${user.id},seller_user_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(60);
    const rows = (data as unknown as Order[]) ?? [];
    setOrders(rows);
    const next: Record<string, string> = {};
    for (const o of rows) {
      if (o.buyer_id === user.id && (o.status === "accepted" || o.status === "seller_confirmed")) {
        const { data: code } = await supabase.rpc("market_handover_code", { p_order: o.id });
        if (typeof code === "string") next[o.id] = code;
      }
    }
    setCodes(next);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = orders.filter((o) => (tab === "buying" ? o.buyer_id === user?.id : o.seller_user_id === user?.id));

  function open(id: string, mode: NonNullable<Panel>["mode"]) {
    setPanel({ id, mode });
    setText("");
    setPhoto(null);
  }

  async function run(id: string, fn: string, args: Record<string, unknown>) {
    setBusy(id);
    const { error } = await supabase.rpc(fn, args);
    setBusy(null);
    if (error) Alert.alert("Couldn't do that", error.message);
    else setPanel(null);
    void load();
  }

  async function addPhoto(orderId: string) {
    if (!user) return;
    try {
      const path = await pickAndUploadEvidence(supabase, orderId, user.id);
      if (path) setPhoto(path);
    } catch (e) {
      Alert.alert("Photo failed", e instanceof Error ? e.message : "Try again.");
    }
  }

  function submitPanel(o: Order) {
    if (!panel) return;
    if (panel.mode === "handover") return run(o.id, "market_seller_confirm", { p_order: o.id, p_code: text.trim(), p_photo: photo });
    if (panel.mode === "confirm") return run(o.id, "market_buyer_confirm", { p_order: o.id, p_photo: photo });
    if (panel.mode === "dispute") return run(o.id, "market_open_dispute", { p_order: o.id, p_reason: text.trim(), p_photo: photo });
    return run(o.id, "market_buyer_cancel", { p_order: o.id, p_note: text.trim() || null });
  }

  const btn = (label: string, onPress: () => void, primary = true, danger = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[styles.btn, { backgroundColor: primary ? colors.inverseBg : colors.bg, borderColor: colors.border, borderWidth: primary ? 0 : 1 }]}
    >
      <AppText weight="700" size={13} style={{ color: primary ? colors.inverseFg : danger ? colors.danger : colors.fg }}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Purchases & sales
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.segment, { backgroundColor: colors.surface }]}>
        {(["buying", "selling"] as const).map((t) => (
          <Pressable key={t} style={[styles.segBtn, { backgroundColor: tab === t ? colors.inverseBg : "transparent" }]} onPress={() => setTab(t)}>
            <AppText weight="700" size={13} style={{ color: tab === t ? colors.inverseFg : colors.muted }}>
              {t === "buying" ? "Buying" : "Selling"}
            </AppText>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.fg} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          {!mine.length ? (
            <EmptyState
              title={tab === "buying" ? "Nothing bought yet" : "No sales yet"}
              description={tab === "buying" ? "Items you pay for from your wallet show up here. Your money is held safely until the handover." : "When someone pays for your listing, it shows up here."}
            />
          ) : (
            mine.map((o) => {
              const buying = o.buyer_id === user?.id;
              const p = panel?.id === o.id ? panel : null;
              const isBusy = busy === o.id;
              return (
                <View key={o.id} style={[styles.card, { backgroundColor: colors.surface }]}>
                  <View style={styles.rowBetween}>
                    <AppText weight="700" style={{ flex: 1 }} numberOfLines={1}>
                      {o.title}
                    </AppText>
                    <AppText weight="700">{formatNaira(o.amount)}</AppText>
                  </View>
                  <AppText size={13}>{statusLine(o, buying)}</AppText>

                  {buying && codes[o.id] ? (
                    <View style={[styles.codeBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                      <AppText size={12} muted>
                        Your handover code. Give it to the seller only when you have the item.
                      </AppText>
                      <AppText size={28} weight="700" style={{ letterSpacing: 6 }}>
                        {codes[o.id]}
                      </AppText>
                    </View>
                  ) : null}

                  {o.status === "disputed" && o.dispute_reason ? (
                    <AppText size={12} muted>
                      Reason given: {o.dispute_reason}
                    </AppText>
                  ) : null}

                  {p ? (
                    <View style={{ gap: 8 }}>
                      {p.mode !== "confirm" ? (
                        <TextInput
                          value={text}
                          onChangeText={setText}
                          keyboardType={p.mode === "handover" ? "number-pad" : "default"}
                          maxLength={p.mode === "handover" ? 6 : 300}
                          placeholder={p.mode === "handover" ? "Buyer's 6-digit code" : p.mode === "dispute" ? "What went wrong? (at least 10 characters)" : "Why do you want to cancel? (optional)"}
                          placeholderTextColor={colors.muted}
                          style={[styles.input, { color: colors.fg, borderColor: colors.border, backgroundColor: colors.bg }]}
                        />
                      ) : (
                        <AppText size={13} muted>
                          Add a photo of what you received, then confirm. This releases the payment to the seller.
                        </AppText>
                      )}
                      {p.mode !== "cancel" ? (
                        <Pressable onPress={() => void addPhoto(o.id)} style={[styles.photoBtn, { borderColor: colors.border }]}>
                          <Ionicons name={photo ? "checkmark-circle" : "camera-outline"} size={18} color={colors.fg} />
                          <AppText size={13} weight="600">
                            {photo ? "Photo added" : p.mode === "dispute" ? "Add a photo (optional)" : "Add a photo"}
                          </AppText>
                        </Pressable>
                      ) : null}
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {btn(isBusy ? "Sending…" : p.mode === "confirm" ? "Confirm received" : "Send", () => void submitPanel(o))}
                        {btn("Back", () => setPanel(null), false)}
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {buying && o.status === "awaiting_seller" ? btn("Cancel and refund", () => void run(o.id, "market_buyer_cancel", { p_order: o.id, p_note: null }), false, true) : null}
                      {buying && o.status === "accepted" && !o.cancel_requested_by ? btn("Ask to cancel", () => open(o.id, "cancel"), false, true) : null}
                      {buying && o.status === "accepted" && o.cancel_requested_by === "buyer" ? btn("Keep the order", () => void run(o.id, "market_withdraw_cancel", { p_order: o.id }), false) : null}
                      {buying && (o.status === "accepted" || o.status === "seller_confirmed") ? btn("I received it", () => open(o.id, "confirm")) : null}
                      {(o.status === "accepted" || o.status === "seller_confirmed") ? btn("Report a problem", () => open(o.id, "dispute"), false, true) : null}

                      {!buying && o.status === "awaiting_seller" ? btn("Accept", () => void run(o.id, "market_accept", { p_order: o.id })) : null}
                      {!buying && (o.status === "awaiting_seller" || o.status === "accepted") ? btn("Decline and refund", () => void run(o.id, "market_decline", { p_order: o.id }), false, true) : null}
                      {!buying && o.status === "accepted" ? btn("Enter code and photo", () => open(o.id, "handover")) : null}
                      {!buying && o.status === "accepted" && o.cancel_requested_by === "buyer"
                        ? [
                            btn("Agree to cancel", () => void run(o.id, "market_cancel_respond", { p_order: o.id, p_agree: true })),
                            btn("Decline cancel", () => void run(o.id, "market_cancel_respond", { p_order: o.id, p_agree: false }), false),
                          ]
                        : null}
                    </View>
                  )}
                  <AppText size={11} muted>
                    {new Date(o.created_at).toLocaleDateString()}
                  </AppText>
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
  segment: { flexDirection: "row", borderRadius: radii.pill, padding: 4, marginHorizontal: 16 },
  segBtn: { flex: 1, height: 38, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radii.md, padding: 14, gap: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  codeBox: { borderRadius: radii.md, borderWidth: 1, padding: 12, gap: 4, alignItems: "center" },
  input: { height: 46, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12, fontSize: 14 },
  photoBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12 },
  btn: { height: 40, borderRadius: radii.pill, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
});
