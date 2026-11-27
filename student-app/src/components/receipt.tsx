import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui";
import { formatNaira } from "@/src/lib/campus";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export type ReceiptStatus = "success" | "pending" | "failed";

export type ReceiptModel = {
  status: ReceiptStatus;
  statusLabel: string;
  /** Always positive; `sign` says which way the money moved. */
  amount: number;
  sign: "-" | "+" | "";
  title: string;
  subtitle?: string;
  when: string;
  rows: { label: string; value: string }[];
  items?: { qty: number; name: string; detail?: string; price?: number }[];
  totals?: { label: string; value: string; strong?: boolean }[];
  code?: { label: string; value: string; hint: string };
  /** Shown at the bottom, e.g. a reference to quote to support. */
  reference?: string;
};

function statusLook(s: ReceiptStatus) {
  if (s === "success") return { icon: "checkmark" as const, key: "success" as const };
  if (s === "pending") return { icon: "time-outline" as const, key: "warn" as const };
  return { icon: "close" as const, key: "danger" as const };
}

export function whenText(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Plain-text copy of a receipt, for sharing. */
export function receiptText(m: ReceiptModel) {
  const lines = [`CampusOS receipt`, m.title, `${m.sign}${formatNaira(m.amount)} · ${m.statusLabel}`, whenText(m.when)];
  for (const r of m.rows) lines.push(`${r.label}: ${r.value}`);
  if (m.items?.length) {
    lines.push("", ...m.items.map((i) => `${i.qty}x ${i.name}${i.price != null ? ` - ${formatNaira(i.price)}` : ""}`));
  }
  if (m.totals?.length) lines.push("", ...m.totals.map((t) => `${t.label}: ${t.value}`));
  if (m.reference) lines.push("", `Ref: ${m.reference}`);
  return lines.join("\n");
}

/** Tear-off line between sections of the receipt. */
function Dash() {
  const colors = useTheme();
  return (
    <View style={{ height: 1, overflow: "hidden" }}>
      <View style={{ height: 2, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: 1 }} />
    </View>
  );
}

export function ReceiptCard({ model: m }: { model: ReceiptModel }) {
  const colors = useTheme();
  const look = statusLook(m.status);
  const tone = colors[look.key];
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: tone }]}>
          <Ionicons name={look.icon} size={26} color="#fff" />
        </View>
        <AppText weight="700" size={15} style={{ color: tone }}>
          {m.statusLabel}
        </AppText>
        <AppText weight="700" size={34} style={{ lineHeight: 42 }}>
          {m.sign}
          {formatNaira(m.amount)}
        </AppText>
        <AppText weight="600" size={15} style={{ textAlign: "center" }}>
          {m.title}
        </AppText>
        {m.subtitle ? (
          <AppText muted size={13} style={{ textAlign: "center" }}>
            {m.subtitle}
          </AppText>
        ) : null}
        <AppText muted size={12}>
          {whenText(m.when)}
        </AppText>
      </View>

      {m.code ? (
        <>
          <Dash />
          <View style={styles.codeBox}>
            <AppText muted size={12} weight="700">
              {m.code.label.toUpperCase()}
            </AppText>
            <View style={styles.digits}>
              {m.code.value.split("").map((d, i) => (
                <View key={i} style={[styles.digit, { backgroundColor: colors.inverseBg }]}>
                  <AppText weight="700" size={30} style={{ color: colors.inverseFg, lineHeight: 38 }}>
                    {d}
                  </AppText>
                </View>
              ))}
            </View>
            <AppText muted size={12} style={{ textAlign: "center" }}>
              {m.code.hint}
            </AppText>
          </View>
        </>
      ) : null}

      <Dash />
      <View style={styles.rows}>
        {m.rows.map((r) => (
          <View key={r.label} style={styles.row}>
            <AppText muted size={13}>
              {r.label}
            </AppText>
            <AppText weight="600" size={13} style={styles.value}>
              {r.value}
            </AppText>
          </View>
        ))}
      </View>

      {m.items?.length ? (
        <>
          <Dash />
          <View style={styles.rows}>
            {m.items.map((i, n) => (
              <View key={n} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <AppText size={13} weight="600">
                    {i.qty}× {i.name}
                  </AppText>
                  {i.detail ? (
                    <AppText muted size={12}>
                      {i.detail}
                    </AppText>
                  ) : null}
                </View>
                {i.price != null ? (
                  <AppText size={13} weight="600">
                    {formatNaira(i.price)}
                  </AppText>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}

      {m.totals?.length ? (
        <>
          <Dash />
          <View style={styles.rows}>
            {m.totals.map((t) => (
              <View key={t.label} style={styles.row}>
                <AppText muted={!t.strong} size={t.strong ? 15 : 13} weight={t.strong ? "700" : "500"}>
                  {t.label}
                </AppText>
                <AppText size={t.strong ? 15 : 13} weight={t.strong ? "700" : "600"}>
                  {t.value}
                </AppText>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Dash />
      <View style={styles.foot}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.muted} />
        <AppText muted size={12} style={{ flex: 1 }}>
          CampusOS{m.reference ? ` · ${m.reference}` : ""}
        </AppText>
      </View>
    </View>
  );
}

/**
 * Full-screen "payment successful" moment shown right after paying.
 * It plays for a couple of seconds (tap to skip), then lets the receipt show.
 */
export function SuccessBurst({
  title,
  amount,
  subtitle,
  onDone,
}: {
  title: string;
  amount?: number;
  subtitle?: string;
  onDone: () => void;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const pop = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const done = useRef(false);

  function finish() {
    if (done.current) return;
    done.current = true;
    Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onDone());
  }

  useEffect(() => {
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(ring, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(text, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    ]).start();
    const t = setTimeout(finish, 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.burst, { backgroundColor: colors.bg, opacity: fade, paddingTop: insets.top }]}>
      <Pressable style={styles.burstInner} onPress={finish} accessibilityLabel="Continue">
        <View style={styles.circleWrap}>
          <Animated.View
            style={[
              styles.ring,
              {
                borderColor: colors.success,
                opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
              },
            ]}
          />
          <Animated.View
            style={[styles.circle, { backgroundColor: colors.success, transform: [{ scale: pop }] }]}
          >
            <Ionicons name="checkmark" size={64} color="#fff" />
          </Animated.View>
        </View>
        <Animated.View
          style={{
            alignItems: "center",
            gap: 6,
            opacity: text,
            transform: [{ translateY: text.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}
        >
          <AppText weight="700" size={24}>
            {title}
          </AppText>
          {amount != null ? (
            <AppText weight="700" size={34} style={{ lineHeight: 42 }}>
              {formatNaira(amount)}
            </AppText>
          ) : null}
          {subtitle ? (
            <AppText muted size={14} style={{ textAlign: "center", paddingHorizontal: 32 }}>
              {subtitle}
            </AppText>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, paddingVertical: 20, gap: 16, overflow: "hidden" },
  top: { alignItems: "center", gap: 6, paddingHorizontal: 20 },
  badge: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  rows: { paddingHorizontal: 20, gap: 10 },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  value: { flexShrink: 1, textAlign: "right" },
  foot: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20 },
  codeBox: { alignItems: "center", gap: 10, paddingHorizontal: 20 },
  digits: { flexDirection: "row", gap: 8 },
  digit: { width: 52, height: 64, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  burst: { zIndex: 10 },
  burstInner: { flex: 1, alignItems: "center", justifyContent: "center", gap: 28 },
  circleWrap: { width: 120, height: 120, alignItems: "center", justifyContent: "center" },
  circle: { width: 112, height: 112, borderRadius: 56, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 112, height: 112, borderRadius: 56, borderWidth: 4 },
});
