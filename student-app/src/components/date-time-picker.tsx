import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Button } from "@/src/components/ui";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export type PickerMode = "date" | "time" | "datetime";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);

const pad = (n: number) => String(n).padStart(2, "0");

export function formatPicked(d: Date | null, mode: PickerMode) {
  if (!d) return "";
  const date = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return mode === "date" ? date : mode === "time" ? time : `${date} · ${time}`;
}

/** "YYYY-MM-DD", "YYYY-MM-DD HH:MM" or "HH:MM" in local time. */
export function toPickerString(d: Date | null, mode: PickerMode) {
  if (!d) return "";
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return mode === "date" ? date : mode === "time" ? time : `${date} ${time}`;
}

/** Reads the strings written by toPickerString (and full ISO timestamps). */
export function fromPickerString(s: string | null | undefined, mode: PickerMode): Date | null {
  const raw = (s ?? "").trim();
  if (!raw) return null;
  if (mode === "time") {
    const m = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 9), Number(m[5] ?? 0));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Tap-to-open date / time field. */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = "date",
  placeholder,
  minimumDate,
  maximumDate,
  clearable = true,
}: {
  label?: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  mode?: PickerMode;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  clearable?: boolean;
}) {
  const colors = useTheme();
  const [open, setOpen] = useState(false);
  const icon = mode === "time" ? "time-outline" : "calendar-outline";
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <AppText size={13} weight="600">
          {label}
        </AppText>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? "Pick"}: ${formatPicked(value, mode) || "not set"}`}
        style={[styles.field, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
      >
        <Ionicons name={icon} size={18} color={value ? colors.fg : colors.muted} />
        <AppText size={15} weight={value ? "600" : "400"} muted={!value} numberOfLines={1} style={{ flex: 1 }}>
          {value ? formatPicked(value, mode) : placeholder ?? (mode === "time" ? "Pick a time" : "Pick a date")}
        </AppText>
        {value && clearable ? (
          <Pressable onPress={() => onChange(null)} hitSlop={10} accessibilityLabel="Clear">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={18} color={colors.muted} />
        )}
      </Pressable>
      <DateTimeSheet
        visible={open}
        title={label}
        mode={mode}
        value={value}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onClose={() => setOpen(false)}
        onConfirm={(d) => {
          setOpen(false);
          onChange(d);
        }}
      />
    </View>
  );
}

export function DateTimeSheet({
  visible,
  title,
  mode,
  value,
  minimumDate,
  maximumDate,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title?: string;
  mode: PickerMode;
  value: Date | null;
  minimumDate?: Date;
  maximumDate?: Date;
  onClose: () => void;
  onConfirm: (d: Date) => void;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const initial = useMemo(() => {
    if (value) return new Date(value);
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    return d;
  }, [value]);
  const [draft, setDraft] = useState(initial);
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [tab, setTab] = useState<"date" | "time">(mode === "time" ? "time" : "date");
  const [yearMode, setYearMode] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft(initial);
    setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setTab(mode === "time" ? "time" : "date");
    setYearMode(false);
  }, [visible, initial, mode]);

  const days = useMemo(() => {
    const first = month.getDay();
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= count; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [month]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const from = minimumDate?.getFullYear() ?? now - 80;
    const to = maximumDate?.getFullYear() ?? now + 10;
    return Array.from({ length: to - from + 1 }, (_, i) => to - i);
  }, [minimumDate, maximumDate]);

  const outOfRange = (d: Date) =>
    (minimumDate && startOfDay(d) < startOfDay(minimumDate)) || (maximumDate && startOfDay(d) > startOfDay(maximumDate));

  function pickDay(d: Date) {
    const next = new Date(draft);
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    setDraft(next);
    if (mode === "datetime") setTab("time");
  }

  const hour12 = draft.getHours() % 12 || 12;
  const pm = draft.getHours() >= 12;
  function setTime(h12: number, minute: number, isPm: boolean) {
    const next = new Date(draft);
    next.setHours((h12 % 12) + (isPm ? 12 : 0), minute, 0, 0);
    setDraft(next);
  }

  const today = new Date();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={[styles.grab, { backgroundColor: colors.border }]} />
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            {title ? (
              <AppText muted size={12} weight="600">
                {title.toUpperCase()}
              </AppText>
            ) : null}
            <AppText size={20} weight="700">
              {formatPicked(draft, mode)}
            </AppText>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.fg} />
          </Pressable>
        </View>

        {mode === "datetime" ? (
          <View style={[styles.tabs, { backgroundColor: colors.surface }]}>
            {(["date", "time"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.tab, tab === t && { backgroundColor: colors.inverseBg }]}
              >
                <AppText size={14} weight="700" style={{ color: tab === t ? colors.inverseFg : colors.muted }}>
                  {t === "date" ? "Date" : "Time"}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {tab === "date" ? (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={styles.monthRow}>
              <Pressable onPress={() => setYearMode((v) => !v)} style={styles.monthTitle} hitSlop={6}>
                <AppText size={16} weight="700">
                  {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                </AppText>
                <Ionicons name={yearMode ? "chevron-up" : "chevron-down"} size={16} color={colors.fg} />
              </Pressable>
              {!yearMode ? (
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Pressable
                    onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                    style={[styles.navBtn, { backgroundColor: colors.surface }]}
                    accessibilityLabel="Previous month"
                  >
                    <Ionicons name="chevron-back" size={18} color={colors.fg} />
                  </Pressable>
                  <Pressable
                    onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                    style={[styles.navBtn, { backgroundColor: colors.surface }]}
                    accessibilityLabel="Next month"
                  >
                    <Ionicons name="chevron-forward" size={18} color={colors.fg} />
                  </Pressable>
                </View>
              ) : null}
            </View>

            {yearMode ? (
              <ScrollView style={{ height: 300 }} contentContainerStyle={styles.yearGrid}>
                {years.map((y) => {
                  const on = y === month.getFullYear();
                  return (
                    <Pressable
                      key={y}
                      onPress={() => {
                        setMonth(new Date(y, month.getMonth(), 1));
                        setYearMode(false);
                      }}
                      style={[styles.yearCell, { backgroundColor: on ? colors.inverseBg : colors.surface }]}
                    >
                      <AppText weight="700" style={{ color: on ? colors.inverseFg : colors.fg }}>
                        {y}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ height: 300 }}>
                <View style={styles.week}>
                  {WEEKDAYS.map((w, i) => (
                    <AppText key={i} muted size={12} weight="700" style={styles.weekday}>
                      {w}
                    </AppText>
                  ))}
                </View>
                <View style={styles.grid}>
                  {days.map((d, i) => {
                    if (!d) return <View key={i} style={styles.cell} />;
                    const on = sameDay(d, draft);
                    const isToday = sameDay(d, today);
                    const disabled = outOfRange(d);
                    return (
                      <Pressable key={i} disabled={!!disabled} onPress={() => pickDay(d)} style={styles.cell}>
                        <View
                          style={[
                            styles.dayDot,
                            on && { backgroundColor: colors.inverseBg },
                            !on && isToday && { borderWidth: 1.5, borderColor: colors.accent },
                          ]}
                        >
                          <AppText
                            size={15}
                            weight={on || isToday ? "700" : "500"}
                            style={{ color: on ? colors.inverseFg : colors.fg, opacity: disabled ? 0.3 : 1 }}
                          >
                            {d.getDate()}
                          </AppText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 14, height: 336 }}>
            <AppText muted size={12} weight="700">
              HOUR
            </AppText>
            <View style={styles.timeGrid}>
              {HOURS.map((h) => {
                const on = h === hour12;
                return (
                  <Pressable
                    key={h}
                    onPress={() => setTime(h, draft.getMinutes(), pm)}
                    style={[styles.timeCell, { backgroundColor: on ? colors.inverseBg : colors.surface }]}
                  >
                    <AppText weight="700" style={{ color: on ? colors.inverseFg : colors.fg }}>
                      {h}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <AppText muted size={12} weight="700">
              MINUTE
            </AppText>
            <View style={styles.timeGrid}>
              {MINUTES.map((m) => {
                const on = m === draft.getMinutes() - (draft.getMinutes() % 5);
                return (
                  <Pressable
                    key={m}
                    onPress={() => setTime(hour12, m, pm)}
                    style={[styles.timeCell, { backgroundColor: on ? colors.inverseBg : colors.surface }]}
                  >
                    <AppText weight="700" style={{ color: on ? colors.inverseFg : colors.fg }}>
                      :{pad(m)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.tabs, { backgroundColor: colors.surface, marginHorizontal: 0 }]}>
              {[false, true].map((isPm) => (
                <Pressable
                  key={String(isPm)}
                  onPress={() => setTime(hour12, draft.getMinutes(), isPm)}
                  style={[styles.tab, pm === isPm && { backgroundColor: colors.inverseBg }]}
                >
                  <AppText size={14} weight="700" style={{ color: pm === isPm ? colors.inverseFg : colors.muted }}>
                    {isPm ? "PM" : "AM"}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          {mode !== "time" ? (
            <Button
              title="Today"
              variant="secondary"
              compact
              onPress={() => {
                const t = new Date(draft);
                t.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
                setDraft(t);
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setTab("date");
              }}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button title="Done" compact onPress={() => onConfirm(draft)} style={{ flex: 2 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 8 },
  grab: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, marginBottom: 10 },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  tabs: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, borderRadius: radii.pill, padding: 4 },
  tab: { flex: 1, height: 38, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  monthTitle: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", paddingVertical: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" },
  dayDot: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  yearGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 8 },
  yearCell: { width: "31%", height: 44, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  timeCell: { width: "15.5%", height: 42, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 14 },
});
