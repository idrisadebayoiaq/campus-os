import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, Input } from "@/src/components/ui";
import { Empty, PageShell, Pill, Segmented, type Tone } from "@/src/components/page";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { pickAndUploadEvidence } from "@/src/lib/evidence";
import { notify, toast } from "@/src/lib/feedback";
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
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

const BADGE: Record<string, { label: string; tone: Tone }> = {
  awaiting_seller: { label: "Pending", tone: "warn" },
  accepted: { label: "Accepted", tone: "warn" },
  seller_confirmed: { label: "Handed over", tone: "warn" },
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
      return buying ? `Seller has until ${when(o.accept_by)}` : `Accept by ${when(o.accept_by)}`;
    case "accepted":
      if (o.cancel_requested_by === "buyer") return buying ? "Cancel requested" : "Buyer wants to cancel";
      return `Handover by ${when(o.handover_by)}`;
    case "seller_confirmed":
      return buying ? `Confirm before ${when(o.release_at)}` : `Pays out ${when(o.release_at)}`;
    case "completed":
      return buying ? "Seller paid" : "Paid to you";
    case "cancelled":
    case "declined":
    case "expired":
      return "Refunded";
    case "disputed":
      return "Under review";
    case "resolved":
      return o.ruling === "release" ? "Seller paid" : o.ruling === "refund" ? "Buyer refunded" : "Split";
    default:
      return "";
  }
}

export default function MarketOrdersScreen() {
  const { user } = useAuth();
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

  const mine = useMemo(
    () => orders.filter((o) => (tab === "buying" ? o.buyer_id === user?.id : o.seller_user_id === user?.id)),
    [orders, tab, user?.id],
  );

  function open(id: string, mode: NonNullable<PanelState>["mode"]) {
    setPanel({ id, mode });
    setText("");
    setPhoto(null);
  }

  async function run(id: string, fn: string, args: Record<string, unknown>, done?: string) {
    setBusy(id);
    const { error } = await supabase.rpc(fn, args);
    setBusy(null);
    if (error) notify("Couldn't do that", error.message, undefined, { tone: "danger" });
    else {
      setPanel(null);
      if (done) toast.success(done);
    }
    void load();
  }

  function confirmRun(title: string, button: string, id: string, fn: string, args: Record<string, unknown>, done: string) {
    notify(title, undefined, [
      { text: "Back", style: "cancel" },
      { text: button, style: "destructive", onPress: () => void run(id, fn, args, done) },
    ]);
  }

  async function addPhoto(orderId: string) {
    if (!user) return;
    try {
      const path = await pickAndUploadEvidence(supabase, orderId, user.id);
      if (path) setPhoto(path);
    } catch (e) {
      notify("Photo failed", e instanceof Error ? e.message : "Try again.", undefined, { tone: "danger" });
    }
  }

  function submitPanel(o: Order) {
    if (!panel) return;
    if (panel.mode === "handover") return run(o.id, "market_seller_confirm", { p_order: o.id, p_code: text.trim(), p_photo: photo }, "Handover confirmed");
    if (panel.mode === "confirm") return run(o.id, "market_buyer_confirm", { p_order: o.id, p_photo: photo }, "Seller paid");
    if (panel.mode === "dispute") return run(o.id, "market_open_dispute", { p_order: o.id, p_reason: text.trim(), p_photo: photo }, "Problem reported");
    return run(o.id, "market_buyer_cancel", { p_order: o.id, p_note: text.trim() || null }, "Cancel requested");
  }

  return (
    <PageShell
      title="Purchases"
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
          { value: "buying", label: "Bought" },
          { value: "selling", label: "Sold" },
        ]}
      />

      {!mine.length ? (
        <Empty
          icon={tab === "buying" ? "bag-handle-outline" : "pricetag-outline"}
          title={tab === "buying" ? "Nothing bought yet" : "No sales yet"}
          body={tab === "buying" ? "Sellers are paid only after you confirm." : undefined}
        />
      ) : (
        mine.map((o) => (
          <OrderCard
            key={o.id}
            o={o}
            buying={o.buyer_id === user?.id}
            code={codes[o.id]}
            panel={panel?.id === o.id ? panel : null}
            busy={busy === o.id}
            text={text}
            photo={photo}
            setText={setText}
            onPhoto={() => void addPhoto(o.id)}
            onSubmit={() => void submitPanel(o)}
            onClose={() => setPanel(null)}
            open={(mode) => open(o.id, mode)}
            run={(fn, args, done) => void run(o.id, fn, args, done)}
            confirmRun={(title, button, fn, args, done) => confirmRun(title, button, o.id, fn, args, done)}
          />
        ))
      )}
    </PageShell>
  );
}

function OrderCard({
  o,
  buying,
  code,
  panel: p,
  busy,
  text,
  photo,
  setText,
  onPhoto,
  onSubmit,
  onClose,
  open,
  run,
  confirmRun,
}: {
  o: Order;
  buying: boolean;
  code?: string;
  panel: PanelState;
  busy: boolean;
  text: string;
  photo: string | null;
  setText: (t: string) => void;
  onPhoto: () => void;
  onSubmit: () => void;
  onClose: () => void;
  open: (mode: NonNullable<PanelState>["mode"]) => void;
  run: (fn: string, args: Record<string, unknown>, done?: string) => void;
  confirmRun: (title: string, button: string, fn: string, args: Record<string, unknown>, done: string) => void;
}) {
  const colors = useTheme();
  const badge = BADGE[o.status] ?? { label: o.status, tone: "neutral" as Tone };
  const live = o.status === "accepted" || o.status === "seller_confirmed";
  const args = { p_order: o.id };

  const actions: { key: string; title: string; variant?: "primary" | "secondary" | "danger"; onPress: () => void }[] = [];
  if (buying) {
    if (o.status === "awaiting_seller")
      actions.push({ key: "c1", title: "Cancel", variant: "danger", onPress: () => confirmRun("Cancel and get a refund?", "Cancel order", "market_buyer_cancel", { ...args, p_note: null }, "Cancelled and refunded") });
    if (live) actions.push({ key: "c4", title: "I got it", onPress: () => open("confirm") });
    if (o.status === "accepted" && !o.cancel_requested_by) actions.push({ key: "c2", title: "Ask to cancel", variant: "secondary", onPress: () => open("cancel") });
    if (o.status === "accepted" && o.cancel_requested_by === "buyer")
      actions.push({ key: "c3", title: "Keep order", variant: "secondary", onPress: () => run("market_withdraw_cancel", args, "Order kept") });
  } else {
    if (o.status === "awaiting_seller") actions.push({ key: "s1", title: "Accept", onPress: () => run("market_accept", args, "Order accepted") });
    if (o.status === "accepted" && o.cancel_requested_by === "buyer") {
      actions.push({ key: "s3", title: "Agree to cancel", onPress: () => run("market_cancel_respond", { ...args, p_agree: true }, "Cancelled") });
      actions.push({ key: "s4", title: "Refuse", variant: "secondary", onPress: () => run("market_cancel_respond", { ...args, p_agree: false }) });
    } else if (o.status === "accepted") actions.push({ key: "s2", title: "Hand over", onPress: () => open("handover") });
    if (o.status === "awaiting_seller" || o.status === "accepted")
      actions.push({ key: "s5", title: "Decline", variant: "danger", onPress: () => confirmRun("Decline and refund the buyer?", "Decline", "market_decline", args, "Declined") });
  }
  if (live) actions.push({ key: "x", title: "Report", variant: "danger", onPress: () => open("dispute") });

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={buying ? "bag-handle" : "pricetag"} size={20} color={colors.fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="700" numberOfLines={1}>
            {o.title}
          </AppText>
          <AppText muted size={12} numberOfLines={1}>
            {statusLine(o, buying)}
          </AppText>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <AppText weight="700" size={16}>
            {formatNaira(o.amount)}
          </AppText>
          <Pill label={badge.label} tone={badge.tone} />
        </View>
      </View>

      {buying && code ? (
        <View style={[styles.code, { backgroundColor: colors.heroBg }]}>
          <AppText size={12} weight="600" style={{ color: colors.heroMuted }}>
            HANDOVER CODE
          </AppText>
          <AppText size={30} weight="700" style={{ letterSpacing: 8, color: colors.heroFg }}>
            {code}
          </AppText>
          <AppText size={11} style={{ color: colors.heroMuted }}>
            Share only after you have the item
          </AppText>
        </View>
      ) : null}

      {o.status === "disputed" && o.dispute_reason ? (
        <AppText size={13} style={{ color: colors.danger }}>
          {o.dispute_reason}
        </AppText>
      ) : null}
      {o.status === "resolved" && o.ruling_note ? (
        <AppText size={13} muted>
          {o.ruling_note}
        </AppText>
      ) : null}

      {p ? (
        <View style={[styles.panel, { borderColor: colors.border }]}>
          <AppText weight="700">
            {p.mode === "handover" ? "Confirm handover" : p.mode === "confirm" ? "Confirm you got it" : p.mode === "dispute" ? "Report a problem" : "Ask to cancel"}
          </AppText>
          {p.mode !== "confirm" ? (
            <Input
              value={text}
              onChangeText={setText}
              keyboardType={p.mode === "handover" ? "number-pad" : "default"}
              maxLength={p.mode === "handover" ? 6 : 300}
              multiline={p.mode === "dispute"}
              placeholder={p.mode === "handover" ? "Buyer's 6-digit code" : p.mode === "dispute" ? "What went wrong?" : "Reason (optional)"}
            />
          ) : null}
          {p.mode !== "cancel" ? (
            <Pressable onPress={onPhoto} style={[styles.photoBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}>
              <Ionicons name={photo ? "checkmark-circle" : "camera-outline"} size={20} color={photo ? colors.success : colors.fg} />
              <AppText weight="600" size={14}>
                {photo ? "Photo added" : p.mode === "dispute" ? "Add photo (optional)" : "Add photo"}
              </AppText>
            </Pressable>
          ) : null}
          <View style={styles.row}>
            <Button compact variant="secondary" title="Back" onPress={onClose} style={{ flex: 1 }} />
            <Button
              compact
              variant={p.mode === "dispute" ? "danger" : "primary"}
              title={p.mode === "confirm" ? "Release payment" : p.mode === "dispute" ? "Report" : "Send"}
              onPress={onSubmit}
              loading={busy}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : actions.length ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Button key={a.key} compact variant={a.variant ?? "primary"} title={a.title} onPress={a.onPress} style={{ flexGrow: 1 }} />
          ))}
        </View>
      ) : null}

      <AppText size={11} muted>
        {new Date(o.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, padding: 16, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  code: { borderRadius: radii.md, padding: 14, gap: 4, alignItems: "center" },
  panel: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  photoBtn: { flexDirection: "row", alignItems: "center", gap: 10, height: 50, borderWidth: 1.5, borderRadius: radii.sm, paddingHorizontal: 16 },
  row: { flexDirection: "row", gap: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
