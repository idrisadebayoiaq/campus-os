import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { AppText, Button, Card, Chip } from "@/src/components/ui";
import { Row, StudyShell, SyncBanner } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { formatDateTime, type StudySession } from "@/src/lib/study";
import { useStudyTable } from "@/src/lib/use-study-table";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Mode = "focus" | "break";
const MINUTES: Record<Mode, number> = { focus: 25, break: 5 };

function fmt(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FocusScreen() {
  const colors = useTheme();
  const store = useStudyTable<StudySession & Record<string, unknown>>({
    table: "study_sessions",
    cacheKey: CACHE_KEYS.focus,
  });

  const [mode, setMode] = useState<Mode>("focus");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(MINUTES.focus * 60 * 1000);
  const endAt = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);

  const addRef = useRef(store.add);
  addRef.current = store.add;
  const log = useCallback(async (minutes: number) => {
    if (minutes < 1) return;
    await addRef.current({ minutes, kind: "focus", note: "Pomodoro" });
  }, []);

  const reset = useCallback((next: Mode) => {
    setMode(next);
    setRunning(false);
    endAt.current = null;
    startedAt.current = null;
    setRemaining(MINUTES[next] * 60 * 1000);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (endAt.current == null) return;
      const left = endAt.current - Date.now();
      if (left <= 0) {
        clearInterval(id);
        setRunning(false);
        setRemaining(0);
        if (mode === "focus") {
          void log(MINUTES.focus);
          Alert.alert("Focus complete", "Nice work! Take a 5 minute break.");
          reset("break");
        } else {
          Alert.alert("Break over", "Ready for another focus session?");
          reset("focus");
        }
      } else {
        setRemaining(left);
      }
    }, 500);
    return () => clearInterval(id);
  }, [running, mode, log, reset]);

  function start() {
    const now = Date.now();
    startedAt.current = startedAt.current ?? now;
    endAt.current = now + remaining;
    setRunning(true);
  }

  function pause() {
    if (endAt.current != null) setRemaining(Math.max(0, endAt.current - Date.now()));
    setRunning(false);
  }

  function stopEarly() {
    const elapsedMin = Math.floor(
      (MINUTES[mode] * 60 * 1000 - remaining) / 60000,
    );
    if (mode === "focus" && elapsedMin >= 1) void log(elapsedMin);
    reset(mode);
  }

  const todayMinutes = store.items
    .filter((s) => s.created_at && new Date(s.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

  return (
    <StudyShell
      title="Focus timer"
      subtitle="25 minutes on, 5 minutes off"
      refreshing={store.refreshing}
      onRefresh={store.refresh}
      banner={<SyncBanner offline={store.offline} pending={store.pendingCount} error={store.error} />}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Focus 25" active={mode === "focus"} onPress={() => !running && reset("focus")} />
        <Chip label="Break 5" active={mode === "break"} onPress={() => !running && reset("break")} />
      </View>

      <View
        style={{
          backgroundColor: colors.heroBg,
          borderRadius: radii.xl,
          paddingVertical: 36,
          alignItems: "center",
          gap: 4,
        }}
      >
        <AppText size={13} style={{ color: colors.heroMuted }}>
          {mode === "focus" ? "Stay focused" : "Rest and recharge"}
        </AppText>
        <AppText size={64} weight="700" style={{ color: colors.heroFg, lineHeight: 76 }}>
          {fmt(remaining)}
        </AppText>
        <AppText size={13} style={{ color: colors.heroMuted }}>
          {todayMinutes} min logged today
        </AppText>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        {running ? (
          <Button title="Pause" variant="secondary" onPress={pause} style={{ flex: 1 }} />
        ) : (
          <Button
            title={remaining < MINUTES[mode] * 60 * 1000 ? "Resume" : "Start"}
            onPress={start}
            style={{ flex: 1 }}
          />
        )}
        <Button title="Reset" variant="secondary" onPress={stopEarly} style={{ flex: 1 }} />
      </View>

      <AppText weight="700" size={17}>
        Recent sessions
      </AppText>
      {store.items.length === 0 ? (
        <Card>
          <AppText muted size={14}>
            Finish a focus session to start your log. Sessions are saved on this
            device and synced when online.
          </AppText>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {store.items.slice(0, 15).map((s) => (
            <Row
              key={s.id}
              pending={s._pending}
              info={{
                title: `${s.minutes} min · ${s.kind ?? "focus"}`,
                subtitle: formatDateTime(s.created_at),
              }}
            />
          ))}
        </View>
      )}
    </StudyShell>
  );
}
