import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Empty, PageShell } from "@/src/components/page";
import { AppText, Button } from "@/src/components/ui";
import { formatNaira } from "@/src/lib/campus";
import { cartCount, cartSubtotal, clearCart, lineTotal, setLineQuantity, useCart } from "@/src/lib/cart";
import { notify } from "@/src/lib/feedback";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function CartScreen() {
  const colors = useTheme();
  const cart = useCart();
  const count = cartCount(cart);
  const subtotal = cartSubtotal(cart);

  if (!cart.lines.length) {
    return (
      <PageShell title="Cart">
        <Empty
          icon="cart-outline"
          title="Your cart is empty"
          action={<Button compact title="Browse food" onPress={() => router.replace("/explore/food")} style={{ marginTop: 8 }} />}
        />
      </PageShell>
    );
  }

  function clear() {
    notify("Empty your cart?", undefined, [
      { text: "Keep", style: "cancel" },
      { text: "Empty cart", style: "destructive", onPress: () => clearCart() },
    ]);
  }

  return (
    <PageShell
      title="Cart"
      subtitle={cart.businessName || undefined}
      right={
        <Pressable onPress={clear} hitSlop={10} accessibilityLabel="Empty cart">
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      }
      footer={
        <View style={{ gap: 10 }}>
          <View style={styles.total}>
            <AppText muted>
              {count} item{count === 1 ? "" : "s"}
            </AppText>
            <AppText weight="700" size={20}>
              {formatNaira(subtotal)}
            </AppText>
          </View>
          <Button title="Checkout" onPress={() => router.push("/checkout")} />
        </View>
      }
    >
      <View style={{ gap: 10 }}>
        {cart.lines.map((l) => (
          <View key={l.key} style={[styles.line, { backgroundColor: colors.surface }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <AppText weight="700" numberOfLines={2}>
                {l.name}
              </AppText>
              {l.options.length ? (
                <AppText muted size={12} numberOfLines={2}>
                  {l.options.map((o) => o.name).join(", ")}
                </AppText>
              ) : null}
              <AppText weight="700" size={15} style={{ marginTop: 4 }}>
                {formatNaira(lineTotal(l))}
              </AppText>
            </View>
            <View style={[styles.stepper, { backgroundColor: colors.bg }]}>
              <Pressable onPress={() => setLineQuantity(l.key, l.quantity - 1)} hitSlop={8} style={styles.stepBtn} accessibilityLabel="Less">
                <Ionicons name={l.quantity === 1 ? "trash-outline" : "remove"} size={16} color={l.quantity === 1 ? colors.danger : colors.fg} />
              </Pressable>
              <AppText weight="700" style={{ minWidth: 20, textAlign: "center" }}>
                {l.quantity}
              </AppText>
              <Pressable
                onPress={() => setLineQuantity(l.key, l.quantity + 1)}
                hitSlop={8}
                style={[styles.stepBtn, { backgroundColor: colors.accent }]}
                accessibilityLabel="More"
              >
                <Ionicons name="add" size={16} color={colors.onAccent} />
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <Pressable onPress={() => router.back()} style={[styles.more, { borderColor: colors.border }]}>
        <Ionicons name="add-circle-outline" size={18} color={colors.fg} />
        <AppText weight="600">Add more items</AppText>
      </Pressable>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.md },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8, padding: 4, borderRadius: radii.pill },
  stepBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  more: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  total: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
