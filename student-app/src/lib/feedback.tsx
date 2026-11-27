import { Ionicons } from "@expo/vector-icons";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Animated, Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Button } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

/**
 * One look for every message in the app.
 *  - Quick messages (a single "OK") slide in as a toast and go away by themselves.
 *  - Questions and messages that need an action open as a centered card with an icon.
 * `notify` has the same shape as Alert.alert, so it is a drop-in replacement.
 */

export type FeedbackTone = "success" | "danger" | "warn" | "info";

export type FeedbackButton = {
  text?: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type Item = {
  id: number;
  title: string;
  message?: string;
  tone: FeedbackTone;
  buttons: FeedbackButton[];
  kind: "toast" | "dialog" | "sheet";
};

type Host = { show: (item: Omit<Item, "id">) => void };
let host: Host | null = null;

function inferTone(title: string, buttons: FeedbackButton[]): FeedbackTone {
  if (buttons.some((b) => b.style === "destructive")) return "warn";
  if (/couldn.?t|could not|can.?t|cannot|failed|error|unable|wrong|invalid|denied|not available/i.test(title)) return "danger";
  if (/sent|saved|thanks|thank you|done|complete|success|received|well done|nice|welcome|added|updated|active|paid/i.test(title)) return "success";
  return "info";
}

/** Drop-in replacement for Alert.alert(title, message, buttons). */
export function notify(title: string, message?: string, buttons?: FeedbackButton[], options?: { tone?: FeedbackTone }) {
  const list = buttons ?? [];
  const tone = options?.tone ?? inferTone(title, list);
  const quick = list.length === 0 || (list.length === 1 && !list[0].onPress && list[0].style !== "destructive");
  if (!host) {
    Alert.alert(title, message, list.length ? list : undefined);
    return;
  }
  // Three or more choices read better as a list of options.
  const choices = list.filter((b) => b.style !== "cancel").length;
  host.show({ title, message, tone, buttons: list, kind: quick ? "toast" : choices >= 3 ? "sheet" : "dialog" });
}

/** Bottom sheet of options, e.g. a chat's ⋮ menu. A Cancel row is added for you. */
export function actionSheet(title: string, options: FeedbackButton[], message?: string) {
  const list = options.some((o) => o.style === "cancel") ? options : [...options, { text: "Cancel", style: "cancel" as const }];
  if (!host) {
    Alert.alert(title, message, list);
    return;
  }
  host.show({ title, message, tone: "info", buttons: list, kind: "sheet" });
}

export const toast = {
  success: (title: string, message?: string) => notify(title, message, undefined, { tone: "success" }),
  error: (title: string, message?: string) => notify(title, message, undefined, { tone: "danger" }),
  info: (title: string, message?: string) => notify(title, message, undefined, { tone: "info" }),
};

const FeedbackContext = createContext<{ notify: typeof notify }>({ notify });
export const useFeedback = () => useContext(FeedbackContext);

function toneStyle(colors: ReturnType<typeof useTheme>, tone: FeedbackTone) {
  switch (tone) {
    case "success":
      return { color: colors.success, icon: "checkmark-circle" as const };
    case "danger":
      return { color: colors.danger, icon: "close-circle" as const };
    case "warn":
      return { color: colors.warn, icon: "warning" as const };
    default:
      return { color: colors.accent, icon: "information-circle" as const };
  }
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toastItem, setToastItem] = useState<Item | null>(null);
  const [queue, setQueue] = useState<Item[]>([]);
  const counter = useRef(0);

  const show = useCallback((item: Omit<Item, "id">) => {
    const next: Item = { ...item, id: ++counter.current };
    if (item.kind === "toast") setToastItem(next);
    else setQueue((q) => [...q, next]);
  }, []);

  useEffect(() => {
    host = { show };
    return () => {
      host = null;
    };
  }, [show]);

  const dialog = queue[0] ?? null;
  const value = useMemo(() => ({ notify }), []);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Toast item={toastItem} onDone={() => setToastItem(null)} />
      {dialog?.kind === "sheet" ? (
        <Sheet item={dialog} onDone={() => setQueue((q) => q.slice(1))} />
      ) : (
        <Dialog item={dialog} onDone={() => setQueue((q) => q.slice(1))} />
      )}
    </FeedbackContext.Provider>
  );
}

function Toast({ item, onDone }: { item: Item | null; onDone: () => void }) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<Item | null>(null);

  useEffect(() => {
    if (!item) return;
    setShown(item);
    slide.setValue(0);
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }).start();
    const ms = item.tone === "danger" ? 5200 : item.message ? 4200 : 3200;
    const t = setTimeout(() => close(), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  function close() {
    Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) {
        setShown(null);
        onDone();
      }
    });
  }

  if (!shown) return null;
  const t = toneStyle(colors, shown.tone);
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.toastWrap,
        {
          top: insets.top + 10,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        },
      ]}
    >
      <Pressable
        onPress={close}
        accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.toastBar, { backgroundColor: t.color }]} />
        <Ionicons name={t.icon} size={24} color={t.color} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="700" size={14}>
            {shown.title}
          </AppText>
          {shown.message ? (
            <AppText muted size={13}>
              {shown.message}
            </AppText>
          ) : null}
        </View>
        <Ionicons name="close" size={16} color={colors.muted} />
      </Pressable>
    </Animated.View>
  );
}

function Dialog({ item, onDone }: { item: Item | null; onDone: () => void }) {
  const colors = useTheme();
  if (!item) return null;
  const t = toneStyle(colors, item.tone);
  const buttons: FeedbackButton[] = item.buttons.length ? item.buttons : [{ text: "OK" }];
  // Cancel goes last when stacked; the action sits first.
  const cancel = buttons.find((b) => b.style === "cancel");
  const actions = buttons.filter((b) => b.style !== "cancel");
  const ordered = cancel ? [...actions, cancel] : actions;

  function press(b: FeedbackButton) {
    onDone();
    b.onPress?.();
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => press(cancel ?? buttons[0])} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <View style={[styles.iconCircle, { backgroundColor: t.color + "22" }]}>
            <Ionicons name={t.icon} size={34} color={t.color} />
          </View>
          <AppText weight="700" size={19} style={{ textAlign: "center" }}>
            {item.title}
          </AppText>
          {item.message ? (
            <AppText muted size={14} style={{ textAlign: "center" }}>
              {item.message}
            </AppText>
          ) : null}
          <View style={{ alignSelf: "stretch", gap: 10, marginTop: 6 }}>
            {ordered.map((b, i) => {
              const isCancel = b.style === "cancel";
              const destructive = b.style === "destructive";
              return (
                <Button
                  key={`${b.text}-${i}`}
                  title={b.text ?? "OK"}
                  variant={isCancel ? "ghost" : destructive ? "danger" : i === 0 ? "primary" : "secondary"}
                  onPress={() => press(b)}
                />
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Sheet({ item, onDone }: { item: Item; onDone: () => void }) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const cancel = item.buttons.find((b) => b.style === "cancel");
  const actions = item.buttons.filter((b) => b.style !== "cancel");

  function press(b?: FeedbackButton) {
    onDone();
    b?.onPress?.();
  }

  return (
    <Modal transparent visible animationType="slide" onRequestClose={() => press(cancel)} statusBarTranslucent>
      <Pressable style={styles.sheetBackdrop} onPress={() => press(cancel)} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.sheetGroup, { backgroundColor: colors.bg }]}>
          {item.title || item.message ? (
            <View style={[styles.sheetHead, { borderBottomColor: colors.border }]}>
              {item.title ? (
                <AppText weight="700" size={15} style={{ textAlign: "center" }} numberOfLines={2}>
                  {item.title}
                </AppText>
              ) : null}
              {item.message ? (
                <AppText muted size={13} style={{ textAlign: "center" }}>
                  {item.message}
                </AppText>
              ) : null}
            </View>
          ) : null}
          {actions.map((b, i) => (
            <Pressable
              key={`${b.text}-${i}`}
              onPress={() => press(b)}
              style={({ pressed }) => [
                styles.sheetRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                pressed && { backgroundColor: colors.surface },
              ]}
            >
              <AppText size={17} weight="600" style={{ color: b.style === "destructive" ? colors.danger : colors.fg }}>
                {b.text ?? "OK"}
              </AppText>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => press(cancel)}
          style={({ pressed }) => [
            styles.sheetGroup,
            styles.sheetRow,
            { backgroundColor: pressed ? colors.surface : colors.bg, marginTop: 8 },
          ]}
        >
          <AppText size={17} weight="700">
            {cancel?.text ?? "Cancel"}
          </AppText>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 10, right: 10, bottom: 0 },
  sheetGroup: { borderRadius: radii.md, overflow: "hidden" },
  sheetHead: { paddingVertical: 14, paddingHorizontal: 16, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetRow: { minHeight: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  toastWrap: { position: "absolute", left: 14, right: 14, zIndex: 10000, elevation: 10000 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingRight: 14,
    paddingLeft: 18,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  toastBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    alignItems: "center",
    gap: 10,
  },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 4 },
});
