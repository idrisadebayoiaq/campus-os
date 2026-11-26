import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, EmptyState, Input } from "@/src/components/ui";
import { Group, KeyValue, ListRow, Notice, PageShell, Panel, Section, Segmented } from "@/src/components/page";
import { useAuth } from "@/src/lib/auth";
import { formatNaira } from "@/src/lib/campus";
import { cartSubtotal, clearCart, lineTotal, setLineQuantity, useCart } from "@/src/lib/cart";
import { loadSavedLocation, searchPlaces, type Place, type SavedLocation } from "@/src/lib/location";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

type Quote = { deliverable: boolean; fee: number; min_order: number; distance_km: number | null; reason: string | null };

export default function CheckoutScreen() {
  const { user } = useAuth();
  const colors = useTheme();
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
    const { error: e } = await supabase.rpc("place_food_order", {
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
    clearCart();
    setPlacing(false);
    router.replace("/orders");
  }

  if (!cart.lines.length) {
    return (
      <PageShell title="Checkout">
        <EmptyState title="Your cart is empty" description="Add dishes from a campus kitchen to order." />
        <Button title="Back" onPress={() => router.back()} />
      </PageShell>
    );
  }

  const short = walletBalance < estimate;

  return (
    <PageShell
      title="Checkout"
      subtitle={cart.businessName ?? undefined}
      footer={
        <>
          {blocked ? (
            <AppText size={13} style={{ color: colors.danger, textAlign: "center", marginBottom: 10 }}>
              {blocked}
            </AppText>
          ) : null}
          <Button
            title={placing ? "Placing…" : `Pay from wallet · ${formatNaira(estimate)}`}
            onPress={() => void submit()}
            disabled={!!blocked}
            loading={placing}
          />
          {short && walletOn ? (
            <Button variant="ghost" title="Add money to wallet" onPress={() => router.push("/wallet")} style={{ marginTop: 4 }} />
          ) : null}
        </>
      }
    >
      <Section title="Your order">
        <Group>
          {cart.lines.map((l) => (
            <ListRow
              key={l.key}
              title={l.name}
              subtitle={[l.options.map((o) => o.name).join(", "), formatNaira(lineTotal(l))].filter(Boolean).join(" · ")}
              numberOfLines={2}
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Pressable
                    onPress={() => setLineQuantity(l.key, l.quantity - 1)}
                    hitSlop={8}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="remove" size={16} color={colors.fg} />
                  </Pressable>
                  <AppText weight="700" style={{ minWidth: 18, textAlign: "center" }}>
                    {l.quantity}
                  </AppText>
                  <Pressable
                    onPress={() => setLineQuantity(l.key, l.quantity + 1)}
                    hitSlop={8}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="add" size={16} color={colors.onAccent} />
                  </Pressable>
                </View>
              }
            />
          ))}
        </Group>
      </Section>

      <Segmented
        value={fulfilment}
        onChange={setFulfilment}
        options={[
          { value: "pickup", label: "Pickup" },
          { value: "delivery", label: "Delivery" },
        ]}
      />

      {delivery ? (
        <Section title="Deliver to">
          {place ? (
            <Group>
              <ListRow icon="location-outline" title={place.label} numberOfLines={2} />
            </Group>
          ) : null}
          <Input
            value={addressQuery}
            onChangeText={setAddressQuery}
            placeholder={place ? "Search a different address…" : "Search your hostel or address…"}
          />
          {searching ? <ActivityIndicator color={colors.fg} /> : null}
          {results.length ? (
            <Group>
              {results.map((r) => (
                <ListRow
                  key={r.id}
                  title={r.title}
                  subtitle={r.subtitle}
                  chevron={false}
                  onPress={() => {
                    setPlace({ lat: r.lat, lng: r.lng, label: r.label });
                    setResults([]);
                    setAddressQuery("");
                  }}
                />
              ))}
            </Group>
          ) : null}
          <Input value={detail} onChangeText={setDetail} placeholder="Room / gate / landmark (so the rider finds you)" />
          {quote ? (
            <Notice tone={quote.deliverable ? "neutral" : "danger"} icon="bicycle-outline">
              {quote.deliverable
                ? `${quote.distance_km != null ? `${Number(quote.distance_km).toFixed(1)} km away · ` : ""}Delivery fee ${formatNaira(Number(quote.fee))}`
                : quote.reason || "No delivery to this address."}
            </Notice>
          ) : null}
        </Section>
      ) : null}

      <Section title="Promo code" hint="The discount is checked and applied when you place the order">
        <Input value={promo} onChangeText={(t) => setPromo(t.toUpperCase())} autoCapitalize="characters" placeholder="Have a code?" />
      </Section>

      <Section title="Note for the kitchen">
        <Input value={note} onChangeText={setNote} maxLength={300} placeholder="e.g. No pepper" />
      </Section>

      <Section title="Payment">
        <Group>
          <ListRow
            icon="wallet-outline"
            title="CampusOS wallet"
            subtitle={`Balance ${formatNaira(walletBalance)} · tap to add money`}
            onPress={() => router.push("/wallet")}
          />
        </Group>
        {!walletOn ? <Notice tone="danger">The wallet is not available right now, so orders can't be paid.</Notice> : null}
      </Section>

      <Panel>
        <KeyValue label="Items" value={formatNaira(subtotal)} />
        {delivery ? <KeyValue label="Delivery" value={quote?.deliverable ? formatNaira(fee) : "–"} /> : null}
        <KeyValue label="Estimated total" value={formatNaira(estimate)} strong />
        <AppText size={12} muted>
          The final price is confirmed by the server (specials and promo codes included).
        </AppText>
      </Panel>

      {error ? <Notice tone="danger">{error}</Notice> : null}
    </PageShell>
  );
}
