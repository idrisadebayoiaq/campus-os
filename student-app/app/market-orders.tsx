import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, EmptyState, Input } from "@/src/components/ui";
import { Notice, PageShell, Panel, Pill, Segmented, type Tone } from "@/src/components/page";
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

type PanelState = { id: string; mode: "handover" | "confirm" | "dispute" | "cancel" } | null;

const COLUMNS =
  "id, title, buyer_id, seller_user_id, seller_business_id, amount, status, accept_by, handover_by, release_at, cancel_requested_by, cancel_note, dispute_reason, ruling, ruling_note, created_at";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

const BADGE: Record<string, { label: string; tone: Tone }> = {
  awaiting_seller: { label: "Waiting for seller", tone: "warn" },
  accepted: { label: "In progress", tone: "warn" },
  seller_confirmed: { label: "Confirm receipt", tone: "warn" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  declined: { label: "Declined", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  disputed: { label: "In dispute", tone: "danger" },
  resolved: { label: "Decided", tone: "neutral" },
};

function statusLine(o: Order, buying: boolean) {
  switch (o.status) {
    case "awaiting_seller":
      return buying ? `Waiting for the seller to accept (by ${when(o.accept_by)})` : `Accept by ${when(o.accept_by)} or the buyer is refunded`;
    case "accepted":
      if (o.cancel_requested_by === "buyer") return buying ? "You asked to cancel. Waiting for the seller." : "The buyer wants to cancel";
      return buying ? `Accepted. Meet the seller by ${when(o.handover_by)}` : `Accepted. Hand over by ${when(o.handover_by)}`;
    case "seller_confirmed":
      return buying
        ? `Seller says it was handed over. Confirm or report a problem before ${when(o.release_at)}, then payment is released`
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
      return "CampusOS is reviewing what happened";
    case "resolved":
      return `Decided: ${o.ruling === "release" ? "paid the seller" : o.ruling === "refund" ? "refunded the buyer" : "split"}${o.ruling_note ? ` · ${o.ruling_note}` : ""}`;
    default:
      return o.status;
  }
}

export default function MarketOrdersScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"buying" | "selling">("buying");
  const [panel, setPanel] = useState<PanelState>(null);
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

  function open(id: string, mode: NonNullable<PanelState>["mode"]) {
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

  const action = (key: string, title: string, onPress: () => void, variant: "primary" | "secondary" | "danger" = "primary") => (
    <Button key={key} compact variant={variant} title={title} onPress={onPress} style={{ flexGrow: 1 }} />
  );

  return (
    <PageShell
      title="Purchases & sales"
      subtitle="Your money is held safely until the handover"
      loading={loading}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "buying", label: "Buying" },
          { value: "selling", label: "Selling" },
        ]}
      />

      {!mine.length ? (
        <EmptyState
          title={tab === "buying" ? "Nothing bought yet" : "No sales yet"}
          description={
            tab === "buying"
              ? "Items you pay for from your wallet show up here. The seller is paid only after you confirm the handover."
              : "When someone pays for your listing, it shows up here."
          }
        />
      ) : (
        mine.map((o) => {
          const buying = o.buyer_id === user?.id;
          const p = panel?.id === o.id ? panel : null;
          const isBusy = busy === o.id;
          const badge = BADGE[o.status] ?? { label: o.status, tone: "neutral" as Tone };
          const live = o.status === "accepted" || o.status === "seller_confirmed";
          return (
            <Panel key={o.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <AppText weight="700" numberOfLines={2}>
                    {o.title}
                  </AppText>
                  <Pill label={badge.label} tone={badge.tone} />
                </View>
                <AppText weight="700" size={17}>
                  {formatNaira(o.amount)}
                </AppText>
              </View>

              <AppText size={13} style={{ opacity: 0.85 }}>
                {statusLine(o, buying)}
              </AppText>

              {buying && codes[o.id] ? (
                <View style={[codeBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <AppText size={12} muted style={{ textAlign: "center" }}>
                    Your handover code. Give it to the seller only when you have the item.
                  </AppText>
                  <AppText size={32} weight="700" style={{ letterSpacing: 8 }}>
                    {codes[o.id]}
                  </AppText>
                </View>
              ) : null}

              {o.status === "disputed" && o.dispute_reason ? <Notice tone="danger">{`Reason given: ${o.dispute_reason}`}</Notice> : null}

              {p ? (
                <View style={{ gap: 10 }}>
                  {p.mode !== "confirm" ? (
                    <Input
                      value={text}
                      onChangeText={setText}
                      keyboardType={p.mode === "handover" ? "number-pad" : "default"}
                      maxLength={p.mode === "handover" ? 6 : 300}
                      multiline={p.mode === "dispute"}
                      placeholder={
                        p.mode === "handover"
                          ? "Buyer's 6-digit code"
                          : p.mode === "dispute"
                            ? "What went wrong? (at least 10 characters)"
                            : "Why do you want to cancel? (optional)"
                      }
                    />
                  ) : (
                    <Notice icon="camera-outline">Add a photo of what you received, then confirm. This releases the payment to the seller.</Notice>
                  )}
                  {p.mode !== "cancel" ? (
                    <Pressable
                      onPress={() => void addPhoto(o.id)}
                      style={[photoBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                    >
                      <Ionicons name={photo ? "checkmark-circle" : "camera-outline"} size={20} color={photo ? colors.success : colors.fg} />
                      <AppText weight="600" size={14}>
                        {photo ? "Photo added" : p.mode === "dispute" ? "Add a photo (optional)" : "Add a photo"}
                      </AppText>
                    </Pressable>
                  ) : null}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Button
                      compact
                      title={p.mode === "confirm" ? "Confirm received" : p.mode === "dispute" ? "Report problem" : "Send"}
                      onPress={() => void submitPanel(o)}
                      loading={isBusy}
                      style={{ flex: 1 }}
                    />
                    <Button compact variant="secondary" title="Back" onPress={() => setPanel(null)} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {buying && o.status === "awaiting_seller" ? action("c1", "Cancel and refund", () => void run(o.id, "market_buyer_cancel", { p_order: o.id, p_note: null }), "danger") : null}
                  {buying && o.status === "accepted" && !o.cancel_requested_by ? action("c2", "Ask to cancel", () => open(o.id, "cancel"), "secondary") : null}
                  {buying && o.status === "accepted" && o.cancel_requested_by === "buyer" ? action("c3", "Keep the order", () => void run(o.id, "market_withdraw_cancel", { p_order: o.id }), "secondary") : null}
                  {buying && live ? action("c4", "I received it", () => open(o.id, "confirm")) : null}
                  {live ? action("c5", "Report a problem", () => open(o.id, "dispute"), "danger") : null}

                  {!buying && o.status === "awaiting_seller" ? action("s1", "Accept", () => void run(o.id, "market_accept", { p_order: o.id })) : null}
                  {!buying && o.status === "accepted" ? action("s2", "Enter code and photo", () => open(o.id, "handover")) : null}
                  {!buying && o.status === "accepted" && o.cancel_requested_by === "buyer"
                    ? [
                        action("s3", "Agree to cancel", () => void run(o.id, "market_cancel_respond", { p_order: o.id, p_agree: true })),
                        action("s4", "Decline cancel", () => void run(o.id, "market_cancel_respond", { p_order: o.id, p_agree: false }), "secondary"),
                      ]
                    : null}
                  {!buying && (o.status === "awaiting_seller" || o.status === "accepted") ? action("s5", "Decline and refund", () => void run(o.id, "market_decline", { p_order: o.id }), "danger") : null}
                </View>
              )}
              <AppText size={11} muted>
                Ordered {new Date(o.created_at).toLocaleDateString()}
              </AppText>
            </Panel>
          );
        })
      )}
    </PageShell>
  );
}

const codeBox = { borderRadius: radii.md, borderWidth: 1, padding: 14, gap: 6, alignItems: "center" as const };
const photoBtn = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 10,
  height: 52,
  borderWidth: 1.5,
  borderRadius: radii.sm,
  paddingHorizontal: 16,
};
