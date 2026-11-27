import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/ui";
import { maskNaira, usePayAuth } from "@/src/lib/pay-auth";
import { useTheme } from "@/src/theme/ThemeProvider";

export const WALLET_CARD_HEIGHT = 208;

export type LinkedCard = { brand: string | null; last4: string | null; exp: string | null } | null;

function Brand({ brand }: { brand: string | null | undefined }) {
  const b = (brand ?? "").toLowerCase();
  if (b.includes("master")) {
    return (
      <View style={{ flexDirection: "row" }}>
        <View style={[styles.mc, { backgroundColor: "#EB001B" }]} />
        <View style={[styles.mc, { backgroundColor: "#F79E1B", marginLeft: -10, opacity: 0.92 }]} />
      </View>
    );
  }
  const label = b.includes("visa") ? "VISA" : b.includes("verve") ? "verve" : b ? b.toUpperCase().slice(0, 10) : "";
  if (!label) return null;
  return (
    <AppText size={b.includes("visa") ? 20 : 16} weight="700" style={{ color: "#fff", fontStyle: b.includes("visa") ? "italic" : "normal" }}>
      {label}
    </AppText>
  );
}

/** The wallet drawn as a debit card: name, last 4 digits of the linked card, balance. */
export function DebitCard({
  name,
  balance,
  card,
  frozen,
}: {
  name: string;
  balance: number;
  card: LinkedCard;
  frozen?: boolean;
}) {
  const colors = useTheme();
  const { hidden, toggleHidden } = usePayAuth();
  const digits = card?.last4 ? card.last4 : "••••";
  return (
    <View style={[styles.card, { backgroundColor: colors.heroBg }]}>
      <View style={[styles.circle, { width: 230, height: 230, right: -70, top: -90, backgroundColor: "rgba(171,159,242,0.28)" }]} />
      <View style={[styles.circle, { width: 180, height: 180, left: -60, bottom: -100, backgroundColor: "rgba(171,159,242,0.16)" }]} />

      <View style={styles.row}>
        <View>
          <AppText size={11} weight="700" style={{ color: colors.heroMuted, letterSpacing: 1 }}>
            CAMPUSOS WALLET
          </AppText>
          {frozen ? (
            <AppText size={11} weight="700" style={{ color: "#fca5a5" }}>
              ON HOLD
            </AppText>
          ) : null}
        </View>
        <Ionicons name="wifi" size={22} color={colors.heroMuted} style={{ transform: [{ rotate: "90deg" }] }} />
      </View>

      <View style={styles.chipRow}>
        <View style={styles.chip}>
          <View style={styles.chipLineH} />
          <View style={styles.chipLineV} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: "flex-end" }}>
          <Pressable
            onPress={toggleHidden}
            hitSlop={10}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            accessibilityLabel={hidden ? "Show balance" : "Hide balance"}
          >
            <AppText size={11} style={{ color: colors.heroMuted }}>
              Balance
            </AppText>
            <Ionicons name={hidden ? "eye-off-outline" : "eye-outline"} size={16} color={colors.heroMuted} />
          </Pressable>
          <AppText size={28} weight="700" style={{ color: colors.heroFg }} numberOfLines={1}>
            {maskNaira(balance, hidden)}
          </AppText>
        </View>
      </View>

      <AppText size={19} weight="600" style={{ color: colors.heroFg, letterSpacing: 2.5 }}>
        {"••••  ••••  ••••  "}
        {digits}
      </AppText>

      <View style={[styles.row, { alignItems: "flex-end" }]}>
        <View style={{ flex: 1, gap: 1 }}>
          <AppText size={9} weight="700" style={{ color: colors.heroMuted, letterSpacing: 1 }}>
            CARD HOLDER
          </AppText>
          <AppText size={14} weight="700" numberOfLines={1} style={{ color: colors.heroFg, letterSpacing: 0.8 }}>
            {name.toUpperCase()}
          </AppText>
        </View>
        {card?.exp ? (
          <View style={{ marginRight: 14, gap: 1 }}>
            <AppText size={9} weight="700" style={{ color: colors.heroMuted, letterSpacing: 1 }}>
              VALID THRU
            </AppText>
            <AppText size={13} weight="700" style={{ color: colors.heroFg }}>
              {card.exp.replace(/\/20(\d\d)$/, "/$1")}
            </AppText>
          </View>
        ) : null}
        {card ? <Brand brand={card.brand} /> : <AppText size={10} style={{ color: colors.heroMuted }}>No card linked yet</AppText>}
      </View>
    </View>
  );
}

/** Next card: marketplace earnings with the two ways to take the money out. */
export function PayoutCard({
  available,
  onHold,
  disabled,
  onBank,
  onWallet,
  onOpen,
}: {
  available: number;
  onHold: number;
  disabled?: boolean;
  onBank: () => void;
  onWallet: () => void;
  onOpen: () => void;
}) {
  const colors = useTheme();
  const { hidden } = usePayAuth();
  return (
    <View style={[styles.card, { backgroundColor: colors.accent }]}>
      <View style={[styles.circle, { width: 200, height: 200, right: -60, top: -80, backgroundColor: "rgba(255,255,255,0.22)" }]} />
      <Pressable onPress={onOpen} style={styles.row} accessibilityLabel="Open earnings">
        <View style={[styles.badge, { backgroundColor: "rgba(60,49,91,0.14)" }]}>
          <Ionicons name="storefront" size={13} color={colors.onAccent} />
          <AppText size={11} weight="700" style={{ color: colors.onAccent }}>
            MY SALES
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.onAccent} />
      </Pressable>

      <View style={{ gap: 2 }}>
        <AppText size={12} style={{ color: colors.onAccent, opacity: 0.8 }}>
          Available to withdraw
        </AppText>
        <AppText size={32} weight="700" style={{ color: colors.onAccent }} numberOfLines={1}>
          {maskNaira(available, hidden)}
        </AppText>
        <AppText size={12} style={{ color: colors.onAccent, opacity: 0.8 }}>
          {onHold > 0 ? `${maskNaira(onHold, hidden)} on hold until buyers confirm` : "Paid out after the buyer confirms the handover"}
        </AppText>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={onBank}
          disabled={disabled}
          style={[styles.action, { backgroundColor: colors.onAccent, opacity: disabled ? 0.5 : 1 }]}
          accessibilityLabel="Withdraw to bank"
        >
          <Ionicons name="business-outline" size={16} color={colors.accent} />
          <AppText size={13} weight="700" style={{ color: colors.accent }}>
            To bank
          </AppText>
        </Pressable>
        <Pressable
          onPress={onWallet}
          disabled={disabled}
          style={[styles.action, { backgroundColor: "rgba(60,49,91,0.14)", opacity: disabled ? 0.5 : 1 }]}
          accessibilityLabel="Move to wallet"
        >
          <Ionicons name="wallet-outline" size={16} color={colors.onAccent} />
          <AppText size={13} weight="700" style={{ color: colors.onAccent }}>
            To wallet
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: WALLET_CARD_HEIGHT,
    borderRadius: 24,
    padding: 18,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  circle: { position: "absolute", borderRadius: 999 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chipRow: { flexDirection: "row", alignItems: "center" },
  chip: {
    width: 40,
    height: 30,
    borderRadius: 7,
    backgroundColor: "#E7C873",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  chipLineH: { position: "absolute", left: 0, right: 0, top: 14, height: 1.5, backgroundColor: "rgba(0,0,0,0.25)" },
  chipLineV: { position: "absolute", top: 0, bottom: 0, left: 19, width: 1.5, backgroundColor: "rgba(0,0,0,0.25)" },
  mc: { width: 26, height: 26, borderRadius: 13 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: 999 },
});
