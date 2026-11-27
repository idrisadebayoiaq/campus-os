import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, EmptyState, Screen } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import {
  addToCart,
  cartCount,
  cartSubtotal,
  getCart,
  setLineQuantity,
  useCart,
  type CartOption,
} from "@/src/lib/cart";
import { businessTypeLabel } from "@/src/lib/market-discovery";
import { startBusinessChat } from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import {
  levelLabel,
  loadBizMeta,
  replyLabel,
  trackEvent,
  type BizMeta,
} from "@/src/lib/trust";
import { isStudentVerified, verificationGateMessage } from "@/src/lib/verification";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Biz = {
  id: string;
  display_name: string;
  business_type: string | null;
  bio: string | null;
  logo_url: string | null;
  cover_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  show_phone_public: boolean | null;
  show_whatsapp_public: boolean | null;
  verification_label: string | null;
};

type OptionRow = { id: string; name: string; price_delta: number; in_stock: boolean };
type GroupRow = { id: string; name: string; required: boolean; multi: boolean; menu_options: OptionRow[] };
type MenuItem = {
  id: string;
  name: string;
  price: number | null;
  image_url: string | null;
  in_stock: boolean | null;
  menu_option_groups: GroupRow[];
};
type Special = { id: string; title: string; menu_item_id: string; special_price: number; ends_at: string };
type Offer = { id: string; title: string; price: number | null; image_url: string | null };
type Review = { id: string; rating: number; comment: string | null; business_reply: string | null; created_at: string };

export default function BusinessDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const [biz, setBiz] = useState<Biz | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [specials, setSpecials] = useState<Special[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [meta, setMeta] = useState<BizMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  const specialFor = (itemId: string) => specials.find((s) => s.menu_item_id === itemId);
  const priceOf = (m: MenuItem) => specialFor(m.id)?.special_price ?? m.price ?? 0;
  const mine = cart.businessId === id;
  const count = mine ? cartCount(cart) : 0;
  const closed = meta?.open === false;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("business_profiles")
        .select(
          "id, display_name, business_type, bio, logo_url, cover_url, phone, whatsapp, show_phone_public, show_whatsapp_public, verification_label",
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setBiz(null);
        setLoading(false);
        return;
      }
      setBiz(data as Biz);
      const isFoodBiz = data.business_type === "food_vendor";

      const [metaMap, reviewRes] = await Promise.all([
        loadBizMeta(supabase, [id], { checkOpen: isFoodBiz ? [id] : [] }),
        supabase
          .from("business_reviews")
          .select("id, rating, comment, business_reply, created_at")
          .eq("business_id", id)
          .eq("is_hidden", false)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      if (cancelled) return;
      setMeta(metaMap[id] ?? null);
      setReviews((reviewRes.data as Review[]) ?? []);
      trackEvent(supabase, user?.id, "view", "business", id);

      if (isFoodBiz) {
        const [{ data: items }, { data: promos }] = await Promise.all([
          supabase
            .from("menu_items")
            .select(
              "id, name, price, image_url, in_stock, menu_option_groups(id, name, required, multi, sort_order, menu_options(id, name, price_delta, in_stock, sort_order))",
            )
            .eq("business_id", id)
            .eq("is_published", true)
            .order("sort_order")
            .order("name")
            .limit(60),
          supabase
            .from("promotions")
            .select("id, title, menu_item_id, special_price, ends_at")
            .eq("business_id", id)
            .eq("kind", "special")
            .eq("is_active", true)
            .lte("starts_at", new Date().toISOString())
            .gt("ends_at", new Date().toISOString()),
        ]);
        if (cancelled) return;
        setMenu((items as unknown as MenuItem[]) || []);
        setSpecials((promos as Special[]) || []);
      } else {
        const { data: listings } = await supabase
          .from("marketplace_listings")
          .select("id, title, price, image_url")
          .eq("business_id", id)
          .eq("status", "active")
          .limit(40);
        if (!cancelled) setOffers((listings as Offer[]) || []);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  function onAdd(item: MenuItem) {
    if (!biz) return;
    if (closed) {
      setStatus("This kitchen isn't taking orders right now.");
      return;
    }
    const groups = item.menu_option_groups ?? [];
    if (groups.length) {
      setPicked({});
      setPicking(item);
      return;
    }
    addToCart({ id: biz.id, name: biz.display_name }, { menuItemId: item.id, name: item.name, unitPrice: priceOf(item), quantity: 1, options: [] });
  }

  function togglePick(group: GroupRow, optionId: string) {
    setPicked((prev) => {
      const current = prev[group.id] ?? [];
      if (group.multi) {
        return { ...prev, [group.id]: current.includes(optionId) ? current.filter((x) => x !== optionId) : [...current, optionId] };
      }
      return { ...prev, [group.id]: current[0] === optionId ? [] : [optionId] };
    });
  }

  const pickMissing = useMemo(() => {
    if (!picking) return null;
    return picking.menu_option_groups.find((g) => g.required && !(picked[g.id]?.length > 0))?.name ?? null;
  }, [picking, picked]);

  const pickExtra = useMemo(() => {
    if (!picking) return 0;
    return picking.menu_option_groups.reduce(
      (n, g) => n + g.menu_options.filter((o) => picked[g.id]?.includes(o.id)).reduce((s, o) => s + Number(o.price_delta), 0),
      0,
    );
  }, [picking, picked]);

  function confirmPick() {
    if (!picking || !biz || pickMissing) return;
    const options: CartOption[] = picking.menu_option_groups.flatMap((g) =>
      g.menu_options
        .filter((o) => picked[g.id]?.includes(o.id))
        .map((o) => ({ id: o.id, name: o.name, price_delta: Number(o.price_delta) })),
    );
    addToCart({ id: biz.id, name: biz.display_name }, { menuItemId: picking.id, name: picking.name, unitPrice: priceOf(picking), quantity: 1, options });
    setPicking(null);
  }

  async function onMessage() {
    if (!user || !biz) {
      router.push("/(auth)/login");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const verified = await isStudentVerified(supabase, user.id);
      if (!verified) {
        setStatus(verificationGateMessage());
        router.push("/verify");
        return;
      }
      const conversationId = await startBusinessChat(supabase, {
        studentId: user.id,
        businessId: biz.id,
        subject: biz.display_name,
        message: `Hi — I'm interested in ${biz.display_name}.`,
      });
      trackEvent(supabase, user.id, "start_chat", "business", biz.id);
      router.push(`/inbox/${conversationId}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not start chat");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.fg} />
        </View>
      </Screen>
    );
  }

  if (!biz) {
    return (
      <Screen>
        <EmptyState title="Not found" description="This business is unavailable." />
      </Screen>
    );
  }

  const isFood = biz.business_type === "food_vendor";
  const cover = biz.cover_url || biz.logo_url;
  const level = meta ? levelLabel(meta.level) : null;
  const reply = meta ? replyLabel(meta.replyMinutes) : null;
  const specialItems = menu.filter((m) => specialFor(m.id) && m.in_stock !== false);
  const cartLineFor = (itemId: string) => (mine ? cart.lines.filter((l) => l.menuItemId === itemId) : []);

  function renderMenuRow(m: MenuItem) {
    const special = specialFor(m.id);
    const lines = cartLineFor(m.id);
    const qty = lines.reduce((n, l) => n + l.quantity, 0);
    const hasOptions = (m.menu_option_groups ?? []).length > 0;
    return (
      <View key={`${m.id}-${special ? "s" : "m"}`} style={[styles.offerRow, { backgroundColor: colors.surface }]}>
        {m.image_url ? (
          <Image source={{ uri: m.image_url }} style={styles.offerThumb} />
        ) : (
          <View style={[styles.offerThumb, { backgroundColor: colors.accentSoft }]} />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="600" numberOfLines={1}>
            {m.name}
          </AppText>
          {special ? (
            <AppText size={11} style={{ color: colors.success }} weight="700">
              Today&apos;s special
            </AppText>
          ) : hasOptions ? (
            <AppText size={11} muted>
              Choose options
            </AppText>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View style={{ alignItems: "flex-end" }}>
            <AppText weight="700" size={13}>
              {formatNaira(priceOf(m))}
            </AppText>
            {special && m.price != null ? (
              <AppText size={11} muted style={{ textDecorationLine: "line-through" }}>
                {formatNaira(m.price)}
              </AppText>
            ) : null}
          </View>
          {m.in_stock === false ? (
            <AppText size={11} muted>
              Sold out
            </AppText>
          ) : qty > 0 && !hasOptions ? (
            <View style={styles.stepper}>
              <Pressable
                onPress={() => lines[0] && setLineQuantity(lines[0].key, lines[0].quantity - 1)}
                hitSlop={8}
                style={[styles.stepBtn, { backgroundColor: colors.bg }]}
              >
                <Ionicons name="remove" size={16} color={colors.fg} />
              </Pressable>
              <AppText weight="700" size={14} style={{ minWidth: 18, textAlign: "center" }}>
                {qty}
              </AppText>
              <Pressable onPress={() => onAdd(m)} hitSlop={8} style={[styles.stepBtn, { backgroundColor: colors.inverseBg }]}>
                <Ionicons name="add" size={16} color={colors.inverseFg} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => onAdd(m)}
              hitSlop={6}
              style={[styles.addBtn, { backgroundColor: closed ? colors.border : colors.inverseBg }]}
            >
              <AppText size={12} weight="700" style={{ color: colors.inverseFg }}>
                {qty > 0 ? `Add · ${qty} in cart` : "Add"}
              </AppText>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.hero}>
          {cover ? <Image source={{ uri: cover }} style={styles.heroImg} /> : <View style={[styles.heroImg, { backgroundColor: colors.heroBg }]} />}
          <Pressable onPress={() => router.back()} style={[styles.back, { top: insets.top + 8 }]}>
            <Ionicons name="arrow-back" size={18} color="#111" />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            {biz.logo_url ? (
              <Image source={{ uri: biz.logo_url }} style={styles.logo} />
            ) : (
              <View style={[styles.logo, { backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }]}>
                <AppText weight="700">{biz.display_name.slice(0, 1).toUpperCase()}</AppText>
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size={22} weight="700" numberOfLines={2}>
                {biz.display_name}
              </AppText>
              <AppText muted size={13}>
                {businessTypeLabel(biz.business_type)}
                {meta?.rating != null ? ` · ★ ${meta.rating.toFixed(1)} (${meta.reviews})` : ""}
              </AppText>
            </View>
          </View>

          <View style={styles.badgeRow}>
            {isFood ? (
              <View style={[styles.pill, { backgroundColor: closed ? colors.danger : colors.success }]}>
                <AppText size={11} weight="700" style={{ color: "#fff" }}>
                  {meta?.open === false ? "Closed now" : "Open now"}
                </AppText>
              </View>
            ) : null}
            {level ? (
              <View style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
                <AppText size={11} weight="700">
                  {level}
                </AppText>
              </View>
            ) : null}
            {meta?.endorsed ? (
              <View style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
                <AppText size={11} weight="700">
                  School-approved
                </AppText>
              </View>
            ) : null}
            {reply ? (
              <View style={[styles.pill, { backgroundColor: colors.surface }]}>
                <AppText size={11} weight="600">
                  {reply}
                </AppText>
              </View>
            ) : null}
          </View>

          <View style={styles.contactRow}>
            {biz.show_phone_public && biz.phone ? (
              <Pressable onPress={() => void Linking.openURL(`tel:${biz.phone}`)} style={[styles.contactBtn, { backgroundColor: colors.surface }]}>
                <Ionicons name="call-outline" size={18} color={colors.fg} />
                <AppText size={12} weight="600">
                  Call
                </AppText>
              </Pressable>
            ) : null}
            {biz.show_whatsapp_public && biz.whatsapp ? (
              <Pressable
                onPress={() => void Linking.openURL(`https://wa.me/${biz.whatsapp!.replace(/[^\d]/g, "")}`)}
                style={[styles.contactBtn, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="logo-whatsapp" size={18} color={colors.fg} />
                <AppText size={12} weight="600">
                  WhatsApp
                </AppText>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => router.push({ pathname: "/report", params: { type: "business", id: biz.id, title: biz.display_name } })}
              style={[styles.contactBtn, { backgroundColor: colors.surface }]}
            >
              <Ionicons name="flag-outline" size={18} color={colors.fg} />
              <AppText size={12} weight="600">
                Report
              </AppText>
            </Pressable>
          </View>

          {closed ? (
            <View style={[styles.notice, { backgroundColor: colors.surface }]}>
              <AppText size={13}>This kitchen isn&apos;t taking orders right now. You can still browse the menu or message them.</AppText>
            </View>
          ) : null}

          {isFood && specialItems.length ? (
            <View style={{ gap: 8 }}>
              <AppText weight="700" size={16}>
                Today&apos;s specials
              </AppText>
              {specialItems.map(renderMenuRow)}
            </View>
          ) : null}

          <AppText weight="700" size={16}>
            {isFood ? "Menu" : "Available"}
          </AppText>

          {(isFood ? menu : offers).length === 0 ? (
            <AppText muted size={13}>
              Nothing listed yet
            </AppText>
          ) : isFood ? (
            menu.map(renderMenuRow)
          ) : (
            offers.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => router.push(`/explore/marketplace/${o.id}`)}
                style={[styles.offerRow, { backgroundColor: colors.surface }]}
              >
                {o.image_url ? (
                  <Image source={{ uri: o.image_url }} style={styles.offerThumb} />
                ) : (
                  <View style={[styles.offerThumb, { backgroundColor: colors.accentSoft }]} />
                )}
                <AppText weight="600" style={{ flex: 1 }} numberOfLines={1}>
                  {o.title}
                </AppText>
                <AppText weight="700" size={13}>
                  {formatNaira(o.price)}
                </AppText>
              </Pressable>
            ))
          )}

          {reviews.length ? (
            <View style={{ gap: 8 }}>
              <AppText weight="700" size={16}>
                Reviews
              </AppText>
              {reviews.map((r) => (
                <View key={r.id} style={[styles.review, { backgroundColor: colors.surface }]}>
                  <AppText size={13} weight="700" style={{ color: "#F5B301" }}>
                    {"★".repeat(r.rating)}
                    <AppText size={13} muted>
                      {"★".repeat(5 - r.rating)}
                    </AppText>
                  </AppText>
                  {r.comment ? <AppText size={13}>{r.comment}</AppText> : null}
                  {r.business_reply ? (
                    <AppText size={12} muted>
                      Reply: {r.business_reply}
                    </AppText>
                  ) : null}
                </View>
              ))}
              <AppText size={11} muted>
                Reviews come only from students who ordered, visited or enquired.
              </AppText>
            </View>
          ) : null}

          {status ? (
            <AppText size={13} style={{ color: colors.danger }}>
              {status}
            </AppText>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 14), backgroundColor: colors.bg, borderTopColor: colors.border },
        ]}
      >
        {isFood && count > 0 ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => void onMessage()}
              disabled={busy}
              style={[styles.msgBtn, { width: 56, backgroundColor: colors.surface }]}
              accessibilityLabel="Message the kitchen"
            >
              <Ionicons name="chatbubble-outline" size={20} color={colors.fg} />
            </Pressable>
            <Pressable
              onPress={() => router.push("/cart")}
              style={[styles.msgBtn, { flex: 1, backgroundColor: colors.inverseBg }]}
            >
              <AppText weight="700" style={{ color: colors.inverseFg }}>
                {`View cart · ${count} item${count === 1 ? "" : "s"} · ${formatNaira(cartSubtotal(getCart()))}`}
              </AppText>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => void onMessage()}
            disabled={busy}
            style={[styles.msgBtn, { backgroundColor: colors.inverseBg, opacity: busy ? 0.6 : 1 }]}
          >
            <AppText weight="700" style={{ color: colors.inverseFg }}>
              {busy ? "…" : "Message"}
            </AppText>
          </Pressable>
        )}
      </View>

      <Modal visible={!!picking} transparent animationType="slide" onRequestClose={() => setPicking(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(null)} />
        <View style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <AppText weight="700" size={18}>
            {picking?.name}
          </AppText>
          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 16, paddingVertical: 8 }}>
            {picking?.menu_option_groups.map((g) => (
              <View key={g.id} style={{ gap: 8 }}>
                <AppText weight="700" size={14}>
                  {g.name}
                  <AppText size={12} muted>
                    {"  "}
                    {g.required ? "Required" : "Optional"} · {g.multi ? "Pick any" : "Pick one"}
                  </AppText>
                </AppText>
                {g.menu_options.map((o) => {
                  const on = picked[g.id]?.includes(o.id);
                  const out = o.in_stock === false;
                  return (
                    <Pressable
                      key={o.id}
                      disabled={out}
                      onPress={() => togglePick(g, o.id)}
                      style={[
                        styles.optionRow,
                        { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface, opacity: out ? 0.5 : 1 },
                      ]}
                    >
                      <Ionicons
                        name={g.multi ? (on ? "checkbox" : "square-outline") : on ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={colors.fg}
                      />
                      <AppText style={{ flex: 1 }}>{o.name}</AppText>
                      <AppText size={13} muted>
                        {out ? "Sold out" : Number(o.price_delta) > 0 ? `+${formatNaira(Number(o.price_delta))}` : ""}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          {pickMissing ? (
            <AppText size={12} style={{ color: colors.danger }}>
              Choose a {pickMissing.toLowerCase()} option first.
            </AppText>
          ) : null}
          <Pressable
            onPress={confirmPick}
            disabled={!!pickMissing}
            style={[styles.msgBtn, { backgroundColor: colors.inverseBg, opacity: pickMissing ? 0.5 : 1 }]}
          >
            <AppText weight="700" style={{ color: colors.inverseFg }}>
              {picking ? `Add to cart · ${formatNaira(priceOf(picking) + pickExtra)}` : "Add"}
            </AppText>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { height: 220 },
  heroImg: { width: "100%", height: "100%" },
  back: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: 20, gap: 14 },
  titleRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  logo: { width: 56, height: 56, borderRadius: 16 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { paddingHorizontal: 10, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  notice: { padding: 12, borderRadius: radii.md },
  contactRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: radii.pill,
  },
  offerRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radii.md },
  offerThumb: { width: 44, height: 44, borderRadius: 10 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  addBtn: { paddingHorizontal: 14, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  review: { padding: 12, borderRadius: radii.md, gap: 4 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  msgBtn: { height: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { padding: 20, gap: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
  },
});
