import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Children, Fragment, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

/**
 * Shared layout kit so every screen (wallet, payments, orders, earnings, checkout,
 * profile…) looks the same: back button + title, hero card, grouped rows, pills.
 */

export type Tone = "neutral" | "success" | "warn" | "danger";

function toneColor(colors: ReturnType<typeof useTheme>, tone: Tone) {
  return tone === "success"
    ? colors.success
    : tone === "warn"
      ? colors.warn
      : tone === "danger"
        ? colors.danger
        : colors.muted;
}

/* ------------------------------ Shell ------------------------------ */

export function PageShell({
  title,
  subtitle,
  children,
  loading,
  refreshing,
  onRefresh,
  footer,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Sticky action bar at the bottom (e.g. the pay button) */
  footer?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (onBack ? onBack() : router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
          hitSlop={10}
          accessibilityLabel="Back"
          style={[styles.back, { backgroundColor: colors.surface }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.fg} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText size={24} weight="700">
            {title}
          </AppText>
          {subtitle ? (
            <AppText muted size={13}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {right}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        {loading ? (
          <ActivityIndicator color={colors.fg} style={{ marginTop: 48 }} />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[
              styles.content,
              { paddingBottom: footer ? 24 : Math.max(insets.bottom, 12) + 32 },
            ]}
            refreshControl={
              onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.fg} /> : undefined
            }
          >
            {children}
          </ScrollView>
        )}
        {footer ? (
          <View
            style={[
              styles.footer,
              { backgroundColor: colors.bg, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 14) },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/* ------------------------------ Blocks ------------------------------ */

export function Hero({
  label,
  value,
  note,
  children,
}: {
  label: string;
  value: string;
  note?: string;
  children?: ReactNode;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
      <AppText size={13} style={{ color: colors.heroMuted }}>
        {label}
      </AppText>
      <AppText size={40} weight="700" style={{ color: colors.heroFg, lineHeight: 48 }}>
        {value}
      </AppText>
      {note ? (
        <AppText size={13} style={{ color: colors.heroMuted }}>
          {note}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

export function Section({
  title,
  hint,
  action,
  children,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      {title ? (
        <View style={styles.sectionHead}>
          <View style={{ flex: 1 }}>
            <AppText weight="700" size={17}>
              {title}
            </AppText>
            {hint ? (
              <AppText muted size={12}>
                {hint}
              </AppText>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Rounded card whose children (usually ListRow) are separated by hairlines. */
export function Group({ children }: { children: ReactNode }) {
  const colors = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: colors.surface }]}>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 }} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  valueTone = "neutral",
  onPress,
  chevron,
  right,
  numberOfLines = 1,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: Tone;
  onPress?: () => void;
  chevron?: boolean;
  right?: ReactNode;
  numberOfLines?: number;
}) {
  const colors = useTheme();
  const body = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconBox, { backgroundColor: colors.soft }]}>
          <Ionicons name={icon} size={18} color={colors.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="600" numberOfLines={numberOfLines}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText muted size={12} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText weight="700" style={valueTone === "neutral" ? undefined : { color: toneColor(colors, valueTone) }}>
          {value}
        </AppText>
      ) : null}
      {right}
      {chevron || (onPress && chevron !== false) ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const colors = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: colors.soft }]}>
      <AppText size={11} weight="700" style={{ color: tone === "neutral" ? colors.fg : toneColor(colors, tone) }}>
        {label}
      </AppText>
    </View>
  );
}

export function Notice({
  tone = "neutral",
  children,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const colors = useTheme();
  const name: keyof typeof Ionicons.glyphMap =
    icon ?? (tone === "danger" ? "alert-circle-outline" : tone === "success" ? "checkmark-circle-outline" : tone === "warn" ? "warning-outline" : "information-circle-outline");
  return (
    <View style={[styles.notice, { backgroundColor: colors.surface }]}>
      <Ionicons name={name} size={18} color={tone === "neutral" ? colors.muted : toneColor(colors, tone)} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        {typeof children === "string" ? (
          <AppText size={13} style={tone === "neutral" ? { opacity: 0.85 } : { color: toneColor(colors, tone) }}>
            {children}
          </AppText>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export function KeyValue({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.kv}>
      <AppText muted={!strong} weight={strong ? "700" : "400"}>
        {label}
      </AppText>
      <AppText weight={strong ? "700" : "500"}>{value}</AppText>
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: object }) {
  const colors = useTheme();
  return <View style={[styles.panel, { backgroundColor: colors.surface }, style]}>{children}</View>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: colors.surface }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segBtn, { backgroundColor: on ? colors.accent : "transparent" }]}>
            <AppText weight="700" size={14} style={{ color: on ? colors.onAccent : colors.muted }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.chip, { backgroundColor: on ? colors.accent : colors.surface }]}
          >
            <AppText weight="600" size={13} style={{ color: on ? colors.onAccent : colors.muted }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One-line, side-scrolling filter chips. */
export function ScrollChips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -20, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.smallChip, { backgroundColor: on ? colors.inverseBg : colors.surface }]}
          >
            <AppText weight="600" size={13} style={{ color: on ? colors.inverseFg : colors.fg }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Big centered icon + short line for empty lists. */
export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const colors = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name={icon} size={30} color={colors.muted} />
      </View>
      <AppText weight="700" size={17} style={{ textAlign: "center" }}>
        {title}
      </AppText>
      {body ? (
        <AppText muted size={14} style={{ textAlign: "center" }}>
          {body}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  smallChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 20 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  hero: { borderRadius: radii.xl, padding: 22, gap: 4 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  group: { borderRadius: radii.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 },
  iconBox: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: radii.md },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  panel: { borderRadius: radii.lg, padding: 16, gap: 12 },
  segment: { flexDirection: "row", borderRadius: radii.pill, padding: 4 },
  segBtn: { flex: 1, height: 42, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.pill },
});
