import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { cartSubtotal, clearCart, lineTotal, setLineQuantity, useCart } from "@/src/lib/cart";
import { loadSavedLocation, searchPlaces, type Place, type SavedLocation } from "@/src/lib/location";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Quote = { deliverable: boolean; fee: number; min_order: number; distance_km: number | null; reason: string | null };

export default function CheckoutScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const cart = useCart();

  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");
  const [place, setPlace] = useState<SavedLocation | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [promo, setPromo] = useState("");
  const method = "wallet";
  const [walletOn, setWalletOn] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [open, setOpen] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const businessId = cart.businessId;
  const subtotal = cartSubtotal(cart);
  const delivery = fulfilment === "delivery";

  useEffect(() => {
    if (!user || !businessId) return;
    void (async () => {
      const [saved, openNow, wallet, enabled] = await Promise.all([
        loadSavedLocation(supabase, user.id),
        supabase.rpc("business_open_now", { p_business: businessId }),
        supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("setting_bool", { p_key: "wallet_enabled", p_default: true }),
      ]);
      if (saved) setPlace(saved);
      setWalletOn(enabled.data !== false);
      setWalletBalance(Number(wallet.data?.balance ?? 0));
      setOpen(typeof openNow.data === "boolean" ? openNow.data : null);
    })();
  }, [user, businessId]);

  useEffect(() => {
    if (!delivery || !place || !businessId) {
      setQuote(null);
      return;
    }
    void (async () => {
      const { data } = await supabase.rpc("delivery_quote", { p_business: businessId, p_lat: place.lat, p_lng: place.lng });
      const row = (Array.isArray(data) ? data[0] : data) as Quote | undefined;
      setQuote(row ?? null);
    })();
  }, [delivery, place, businessId]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (addressQuery.trim().length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        setResults(await searchPlaces(addressQuery, place));
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [addressQuery, place]);

  const fee = delivery && quote?.deliverable ? Number(quote.fee) : 0;
  const estimate = subtotal + fee;
  const blocked = useMemo(() => {
    if (open === false) return "This kitchen isn't taking orders right now.";
    if (delivery) {
      if (!place) return "Choose where to deliver.";
      if (!quote) return "Checking delivery…";
      if (!quote.deliverable) return quote.reason || "This kitchen doesn't deliver to you.";
      if (subtotal < Number(quote.min_order)) return `Minimum order for delivery is ${formatNaira(Number(quote.min_order))}.`;
    }
    if (!walletOn) return "The wallet is not available right now.";
    if (walletBalance < estimate) {
      return `Your wallet has ${formatNaira(walletBalance)}. Add money to pay for this order.`;
    }
    return null;
  }, [open, delivery, place, quote, subtotal, walletOn, walletBalance, estimate]);

  async function submit() {
    if (!user || !businessId || blocked) return;
    setPlacing(true);
    setError(null);
    const address = delivery ? [detail.trim(), place?.label].filter(Boolean).join(" · ") : null;
    const { data, error: e } = await supabase.rpc("place_food_order", {
      p_business: businessId,
      p_items: cart.lines.map((l) => ({ menu_item_id: l.menuItemId, quantity: l.quantity, option_ids: l.options.map((o) => o.id) })),
      p_notes: note.trim() || null,
      p_fulfilment: fulfilment,
      p_address: address,
      p_lat: delivery ? place?.lat : null,
      p_lng: delivery ? place?.lng : null,
      p_promo_code: promo.trim() || null,
      p_payment_method: method,
    });
    if (e) {
      setPlacing(false);
      setError(e.message);
      return;
    }
    void data;
    clearCart();
    setPlacing(false);
    router.replace("/orders");
  }

  if (!cart.lines.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 16, paddingHorizontal: 16 }}>
        <EmptyState title="Your cart is empty" description="Add dishes from a campus kitchen to order." />
        <Pressable onPress={() => router.back()} style={[styles.cta, { backgroundColor: colors.inverseBg, marginTop: 16 }]}>
          <AppText weight="700" style={{ color: colors.inverseFg }}>
            Back
          </AppText>
        </Pressable>
      </View>
    );
  }

  const seg = (on: boolean) => [styles.segBtn, { backgroundColor: on ? colors.inverseBg : "transparent" }];
  const segText = (on: boolean) => ({ color: on ? colors.inverseFg : colors.muted });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.surface }]} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Checkout
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <AppText weight="700">{cart.businessName}</AppText>

        <View style={{ gap: 8 }}>
          {cart.lines.map((l) => (
            <View key={l.key} style={[styles.line, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText weight="600">{l.name}</AppText>
                {l.options.length ? (
                  <AppText size={12} muted>
                    {l.options.map((o) => o.name).join(", ")}
                  </AppText>
                ) : null}
                <AppText size={12} muted>
                  {formatNaira(lineTotal(l))}
                </AppText>
              </View>
              <View style={styles.stepper}>
                <Pressable onPress={() => setLineQuantity(l.key, l.quantity - 1)} hitSlop={8} style={[styles.stepBtn, { backgroundColor: colors.bg }]}>
                  <Ionicons name="remove" size={16} color={colors.fg} />
                </Pressable>
                <AppText weight="700" style={{ minWidth: 20, textAlign: "center" }}>
                  {l.quantity}
                </AppText>
                <Pressable onPress={() => setLineQuantity(l.key, l.quantity + 1)} hitSlop={8} style={[styles.stepBtn, { backgroundColor: colors.inverseBg }]}>
                  <Ionicons name="add" size={16} color={colors.inverseFg} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.segment, { backgroundColor: colors.surface }]}>
          <Pressable style={seg(!delivery)} onPress={() => setFulfilment("pickup")}>
            <AppText weight="700" size={13} style={segText(!delivery)}>
              Pickup
            </AppText>
          </Pressable>
          <Pressable style={seg(delivery)} onPress={() => setFulfilment("delivery")}>
            <AppText weight="700" size={13} style={segText(delivery)}>
              Delivery
            </AppText>
          </Pressable>
        </View>

        {delivery ? (
          <View style={{ gap: 8 }}>
            <AppText weight="700">Deliver to</AppText>
            {place ? (
              <View style={[styles.line, { backgroundColor: colors.surface }]}>
                <Ionicons name="location-outline" size={18} color={colors.fg} />
                <AppText size={13} style={{ flex: 1 }}>
                  {place.label}
                </AppText>
              </View>
            ) : null}
            <TextInput
              value={addressQuery}
              onChangeText={setAddressQuery}
              placeholder={place ? "Search a different address…" : "Search your hostel or address…"}
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.fg, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            {searching ? <ActivityIndicator color={colors.fg} /> : null}
            {results.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => {
                  setPlace({ lat: r.lat, lng: r.lng, label: r.label });
                  setResults([]);
                  setAddressQuery("");
                }}
                style={[styles.line, { backgroundColor: colors.surface }]}
              >
                <View style={{ flex: 1 }}>
                  <AppText weight="600" size={13}>
                    {r.title}
                  </AppText>
                  <AppText size={12} muted numberOfLines={1}>
                    {r.subtitle}
                  </AppText>
                </View>
              </Pressable>
            ))}
            <TextInput
              value={detail}
              onChangeText={setDetail}
              placeholder="Room / gate / landmark (so the rider finds you)"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.fg, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            {quote ? (
              <AppText size={12} muted>
                {quote.deliverable
                  ? `${quote.distance_km != null ? `${Number(quote.distance_km).toFixed(1)} km away · ` : ""}Delivery fee ${formatNaira(Number(quote.fee))}`
                  : quote.reason || "No delivery to this address."}
              </AppText>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <AppText weight="700">Promo code</AppText>
          <TextInput
            value={promo}
            onChangeText={(t) => setPromo(t.toUpperCase())}
            autoCapitalize="characters"
            placeholder="Have a code?"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.fg, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
          <AppText size={11} muted>
            The discount is checked and applied when you place the order.
          </AppText>
        </View>

        <View style={{ gap: 8 }}>
          <AppText weight="700">Payment</AppText>
          <Pressable onPress={() => router.push("/wallet")} style={[styles.line, { backgroundColor: colors.surface }]}>
            <Ionicons name="wallet-outline" size={20} color={colors.fg} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="600">CampusOS wallet</AppText>
              <AppText size={12} muted>
                Balance {formatNaira(walletBalance)} · tap to add money
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          {!walletOn ? (
            <AppText size={12} style={{ color: colors.danger }}>
              The wallet is not available right now, so orders can't be paid.
            </AppText>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <AppText weight="700">Note for the kitchen</AppText>
          <TextInput
            value={note}
            onChangeText={setNote}
            maxLength={300}
            placeholder="e.g. No pepper"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.fg, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
        </View>

        <View style={[styles.summary, { backgroundColor: colors.surface }]}>
          <View style={styles.rowBetween}>
            <AppText muted>Items</AppText>
            <AppText>{formatNaira(subtotal)}</AppText>
          </View>
          {delivery ? (
            <View style={styles.rowBetween}>
              <AppText muted>Delivery</AppText>
              <AppText>{quote?.deliverable ? formatNaira(fee) : "–"}</AppText>
            </View>
          ) : null}
          <View style={styles.rowBetween}>
            <AppText weight="700">Estimated total</AppText>
            <AppText weight="700">{formatNaira(estimate)}</AppText>
          </View>
          <AppText size={11} muted>
            The final price is confirmed by the server (specials and promo codes included).
          </AppText>
        </View>

        {blocked ? (
          <AppText size={13} style={{ color: colors.danger }}>
            {blocked}
          </AppText>
        ) : null}
        {error ? (
          <AppText size={13} style={{ color: colors.danger }}>
            {error}
          </AppText>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14), backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <Pressable
          onPress={() => void submit()}
          disabled={placing || !!blocked}
          style={[styles.cta, { backgroundColor: colors.inverseBg, opacity: placing || blocked ? 0.5 : 1 }]}
        >
          <AppText weight="700" style={{ color: colors.inverseFg }}>
            {placing ? "Placing…" : `Pay from wallet · ${formatNaira(estimate)}`}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  line: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radii.md },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", borderRadius: radii.pill, padding: 4 },
  segBtn: { flex: 1, height: 40, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  input: { height: 46, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12, fontSize: 14 },
  summary: { borderRadius: radii.md, padding: 14, gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 52, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
});
