import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/src/components/ui";
import { ScrollChips, Segmented } from "@/src/components/page";
import { Row, StudyShell, SyncBanner } from "@/src/components/study";
import { notify } from "@/src/lib/feedback";
import { CACHE_KEYS } from "@/src/lib/offline";
import { cancelLocal, scheduleLocal } from "@/src/lib/push";
import { type StudySession } from "@/src/lib/study";
import { useStudyTable } from "@/src/lib/use-study-table";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Mode = "focus" | "break";
const REMINDER_ID = "focus-timer";
const LENGTHS = ["15", "25", "45", "60"].map((v) => ({ value: v, label: `${v} min` }));
const BREAK_MIN = 5;

function fmt(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function FocusScreen() {
  const colors = useTheme();
  const store = useStudyTable<StudySession & Record<string, unknown>>({ table: "study_sessions", cacheKey: CACHE_KEYS.focus });

  const [focusMin, setFocusMin] = useState(25);
  const [mode, setMode] = useState<Mode>("focus");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(25 * 60 * 1000);
  const endAt = useRef<number | null>(null);
  const total = (mode === "focus" ? focusMin : BREAK_MIN) * 60 * 1000;

  const addRef = useRef(store.add);
  addRef.current = store.add;
  const log = useCallback(async (minutes: number) => {
    if (minutes >= 1) await addRef.current({ minutes, kind: "focus", note: "Pomodoro" });
  }, []);

  const reset = useCallback(
    (next: Mode, length = focusMin) => {
      setMode(next);
      setRunning(false);
      endAt.current = null;
      setRemaining((next === "focus" ? length : BREAK_MIN) * 60 * 1000);
      void cancelLocal(REMINDER_ID);
    },
    [focusMin],
  );

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (endAt.current == null) return;
      const left = endAt.current - Date.now();
      if (left > 0) {
        setRemaining(left);
        return;
      }
      clearInterval(id);
      if (mode === "focus") {
        void log(focusMin);
        notify("Focus done", `Take a ${BREAK_MIN} minute break.`, undefined, { tone: "success" });
        reset("break");
      } else {
        notify("Break over", undefined, undefined, { tone: "info" });
        reset("focus");
      }
    }, 500);
    return () => clearInterval(id);
  }, [running, mode, log, reset, focusMin]);

  useEffect(() => () => void cancelLocal(REMINDER_ID), []);

  function start() {
    endAt.current = Date.now() + remaining;
    setRunning(true);
    void scheduleLocal(
      REMINDER_ID,
      new Date(endAt.current),
      mode === "focus" ? "Focus session done" : "Break over",
      mode === "focus" ? `Nice work. Take a ${BREAK_MIN} minute break.` : "Ready for another round?",
      "/study/focus",
    );
  }

  function pause() {
    if (endAt.current != null) setRemaining(Math.max(0, endAt.current - Date.now()));
    setRunning(false);
    void cancelLocal(REMINDER_ID);
  }

  function stop() {
    const elapsed = Math.floor((total - remaining) / 60000);
    if (mode === "focus" && elapsed >= 1) void log(elapsed);
    reset(mode);
  }

  const today = new Date().toDateString();
  const todays = useMemo(() => store.items.filter((s) => s.created_at && new Date(s.created_at).toDateString() === today), [store.items, today]);
  const todayMinutes = todays.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
  const pct = Math.min(1, Math.max(0, 1 - remaining / total));
  const fresh = remaining >= total && !running;

  return (
    <StudyShell
      title="Focus timer"
      refreshing={store.refreshing}
      onRefresh={store.refresh}
      banner={<SyncBanner offline={store.offline} pending={store.pendingCount} error={store.error} />}
    >
      <Segmented
        value={mode}
        onChange={(m) => !running && reset(m)}
        options={[
          { value: "focus", label: "Focus" },
          { value: "break", label: "Break" },
        ]}
      />

      <View style={[styles.timer, { backgroundColor: colors.heroBg }]}>
        <AppText size={13} weight="600" style={{ color: colors.heroMuted }}>
          {mode === "focus" ? (running ? "FOCUSING" : "READY") : "BREAK"}
        </AppText>
        <AppText size={72} weight="700" style={{ color: colors.heroFg, lineHeight: 84, fontVariant: ["tabular-nums"] }}>
          {fmt(remaining)}
        </AppText>
        <View style={[styles.track, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
          <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: mode === "focus" ? colors.accent : colors.success }]} />
        </View>
        <View style={styles.controls}>
          <Pressable onPress={stop} disabled={fresh} style={[styles.side, { backgroundColor: "rgba(255,255,255,0.12)", opacity: fresh ? 0.4 : 1 }]} accessibilityLabel="Stop">
            <Ionicons name="stop" size={20} color={colors.heroFg} />
          </Pressable>
          <Pressable onPress={running ? pause : start} style={[styles.play, { backgroundColor: colors.accent }]} accessibilityLabel={running ? "Pause" : "Start"}>
            <Ionicons name={running ? "pause" : "play"} size={30} color={colors.onAccent} style={running ? undefined : { marginLeft: 4 }} />
          </Pressable>
          <Pressable
            onPress={() => reset(mode === "focus" ? "break" : "focus")}
            style={[styles.side, { backgroundColor: "rgba(255,255,255,0.12)" }]}
            accessibilityLabel="Skip"
          >
            <Ionicons name="play-skip-forward" size={20} color={colors.heroFg} />
          </Pressable>
        </View>
      </View>

      {mode === "focus" && !running ? (
        <ScrollChips
          options={LENGTHS}
          value={String(focusMin)}
          onChange={(v) => {
            setFocusMin(Number(v));
            reset("focus", Number(v));
          }}
        />
      ) : null}

      <View style={styles.stats}>
        <View style={[styles.stat, { backgroundColor: colors.surface }]}>
          <AppText size={22} weight="700">
            {todayMinutes}
          </AppText>
          <AppText muted size={12}>
            min today
          </AppText>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.surface }]}>
          <AppText size={22} weight="700">
            {todays.length}
          </AppText>
          <AppText muted size={12}>
            sessions today
          </AppText>
        </View>
      </View>

      {store.items.length ? (
        <View style={{ gap: 8 }}>
          <AppText muted size={12} weight="700" style={{ marginLeft: 4 }}>
            RECENT
          </AppText>
          {store.items.slice(0, 8).map((s) => (
            <Row
              key={s.id}
              pending={s._pending}
              icon="timer-outline"
              info={{
                title: `${s.minutes} min focus`,
                subtitle: s.created_at
                  ? new Date(s.created_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                  : undefined,
              }}
            />
          ))}
        </View>
      ) : null}
    </StudyShell>
  );
}

const styles = StyleSheet.create({
  timer: { borderRadius: radii.xl, paddingVertical: 28, paddingHorizontal: 24, alignItems: "center", gap: 6 },
  track: { height: 6, borderRadius: 3, alignSelf: "stretch", overflow: "hidden", marginTop: 6 },
  fill: { height: 6, borderRadius: 3 },
  controls: { flexDirection: "row", alignItems: "center", gap: 28, marginTop: 18 },
  side: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  play: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: radii.md, padding: 14, gap: 2 },
});
