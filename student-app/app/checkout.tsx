import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, Input } from "@/src/components/ui";
import { Empty, Group, KeyValue, ListRow, PageShell, Panel, Section } from "@/src/components/page";
import { useAuth } from "@/src/lib/auth";
import { maskNaira, usePayAuth } from "@/src/lib/pay-auth";
import { formatNaira } from "@/src/lib/campus";
import { cartCount, cartSubtotal, clearCart, useCart } from "@/src/lib/cart";
import { notify } from "@/src/lib/feedback";
import { loadSavedLocation, searchPlaces, type Place, type SavedLocation } from "@/src/lib/location";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Quote = { deliverable: boolean; fee: number; min_order: number; distance_km: number | null; reason: string | null };

export default function CheckoutScreen() {
  const { user } = useAuth();
  const { confirm, hidden } = usePayAuth();
  const colors = useTheme();
  const cart = useCart();

  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");
  const [place, setPlace] = useState<SavedLocation | null>(null);
  const [changing, setChanging] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [promo, setPromo] = useState("");
  const [walletOn, setWalletOn] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [open, setOpen] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const businessId = cart.businessId;
  const subtotal = cartSubtotal(cart);
  const count = cartCount(cart);
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
      setQuote(((Array.isArray(data) ? data[0] : data) as Quote | undefined) ?? null);
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
  const short = walletBalance < estimate;
  const blocked = useMemo(() => {
    if (open === false) return "Kitchen is closed right now";
    if (delivery) {
      if (!place) return "Choose a delivery address";
      if (!quote) return "Checking delivery…";
      if (!quote.deliverable) return quote.reason || "No delivery to this address";
      if (subtotal < Number(quote.min_order)) return `Delivery minimum is ${formatNaira(Number(quote.min_order))}`;
    }
    if (!walletOn) return "Wallet is unavailable right now";
    if (short) return `Wallet balance is ${maskNaira(walletBalance, hidden)}`;
    return null;
  }, [open, delivery, place, quote, subtotal, walletOn, walletBalance, short, hidden]);

  async function submit() {
    if (!user || !businessId || blocked) return;
    if (!(await confirm(`Pay ${formatNaira(estimate)} from your wallet`))) return;
    setPlacing(true);
    const address = delivery ? [detail.trim(), place?.label].filter(Boolean).join(" · ") : null;
    const { data: placed, error } = await supabase.rpc("place_food_order", {
      p_business: businessId,
      p_items: cart.lines.map((l) => ({ menu_item_id: l.menuItemId, quantity: l.quantity, option_ids: l.options.map((o) => o.id) })),
      p_notes: note.trim() || null,
      p_fulfilment: fulfilment,
      p_address: address,
      p_lat: delivery ? place?.lat : null,
      p_lng: delivery ? place?.lng : null,
      p_promo_code: promo.trim() || null,
      p_payment_method: "wallet",
    });
    setPlacing(false);
    if (error) {
      notify("Order not placed", error.message, undefined, { tone: "danger" });
      return;
    }
    clearCart();
    if (router.canDismiss()) router.dismissAll();
    // My orders sits underneath so back from the receipt lands there.
    router.push("/orders");
    const orderId = (Array.isArray(placed) ? placed[0] : placed)?.id as string | undefined;
    if (orderId) router.push({ pathname: "/receipt", params: { kind: "food", id: orderId, fresh: "1" } });
  }

  if (!cart.lines.length) {
    return (
      <PageShell title="Checkout">
        <Empty icon="cart-outline" title="Your cart is empty" action={<Button compact title="Back" onPress={() => router.back()} style={{ marginTop: 8 }} />} />
      </PageShell>
    );
  }

  const option = (value: "pickup" | "delivery", icon: keyof typeof Ionicons.glyphMap, label: string) => {
    const on = fulfilment === value;
    return (
      <Pressable
        onPress={() => setFulfilment(value)}
        style={[styles.option, { backgroundColor: on ? colors.inverseBg : colors.surface }]}
      >
        <Ionicons name={icon} size={22} color={on ? colors.inverseFg : colors.fg} />
        <AppText weight="700" style={{ color: on ? colors.inverseFg : colors.fg }}>
          {label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <PageShell
      title="Checkout"
      subtitle={cart.businessName || undefined}
      footer={
        <View style={{ gap: 8 }}>
          {blocked ? (
            <View style={styles.blocked}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <AppText size={13} weight="600" style={{ color: colors.danger }}>
                {blocked}
              </AppText>
            </View>
          ) : null}
          {short && walletOn ? (
            <Button variant="secondary" title="Top up wallet" onPress={() => router.push("/wallet")} />
          ) : (
            <Button title={`Place order · ${formatNaira(estimate)}`} onPress={() => void submit()} disabled={!!blocked} loading={placing} />
          )}
        </View>
      }
    >
      <View style={styles.options}>
        {option("pickup", "walk-outline", "Pickup")}
        {option("delivery", "bicycle-outline", "Delivery")}
      </View>

      {delivery ? (
        <Section title="Deliver to">
          {place && !changing ? (
            <Group>
              <ListRow
                icon="location"
                title={place.label}
                numberOfLines={2}
                right={
                  <Pressable onPress={() => setChanging(true)} hitSlop={8}>
                    <AppText weight="700" size={13}>
                      Change
                    </AppText>
                  </Pressable>
                }
              />
            </Group>
          ) : (
            <>
              <Input value={addressQuery} onChangeText={setAddressQuery} placeholder="Search hostel or address" autoFocus={changing} />
              {searching ? <ActivityIndicator color={colors.fg} /> : null}
              {results.length ? (
                <Group>
                  {results.map((r) => (
                    <ListRow
                      key={r.id}
                      icon="location-outline"
                      title={r.title}
                      subtitle={r.subtitle}
                      chevron={false}
                      onPress={() => {
                        setPlace({ lat: r.lat, lng: r.lng, label: r.label });
                        setResults([]);
                        setAddressQuery("");
                        setChanging(false);
                      }}
                    />
                  ))}
                </Group>
              ) : null}
            </>
          )}
          <Input value={detail} onChangeText={setDetail} placeholder="Room, gate or landmark" />
          {quote?.deliverable ? (
            <AppText muted size={12}>
              {quote.distance_km != null ? `${Number(quote.distance_km).toFixed(1)} km · ` : ""}Delivery {formatNaira(Number(quote.fee))}
            </AppText>
          ) : null}
        </Section>
      ) : null}

      <Section title="Order">
        <Group>
          <ListRow icon="bag-handle-outline" title={`${count} item${count === 1 ? "" : "s"}`} value={formatNaira(subtotal)} onPress={() => router.back()} />
          <ListRow icon="wallet-outline" title="Wallet" value={maskNaira(walletBalance, hidden)} valueTone={short ? "danger" : "neutral"} onPress={() => router.push("/wallet")} />
        </Group>
      </Section>

      <Section title="Extras">
        <Input value={promo} onChangeText={(t) => setPromo(t.toUpperCase())} autoCapitalize="characters" placeholder="Promo code" />
        <Input value={note} onChangeText={setNote} maxLength={300} placeholder="Note for the kitchen" />
      </Section>

      <Panel>
        <KeyValue label="Subtotal" value={formatNaira(subtotal)} />
        {delivery ? <KeyValue label="Delivery" value={quote?.deliverable ? formatNaira(fee) : "–"} /> : null}
        {promo.trim() ? <KeyValue label="Promo" value="Applied at checkout" /> : null}
        <KeyValue label="Total" value={formatNaira(estimate)} strong />
      </Panel>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: "row", gap: 10 },
  option: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, height: 84, borderRadius: radii.md },
  blocked: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
