import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, BackHandler, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

/**
 * Study lock: the student picks a time and CampusOS stays locked until it ends.
 * The server (public.study_locks) is the clock; the phone keeps a copy so the lock
 * also holds offline and after the app is closed and reopened.
 */

export type StudyLock = {
  id: string;
  label: string | null;
  minutes: number;
  startedAt: number;
  endsAt: number;
};

export type LockSummary = {
  label: string | null;
  minutes: number;
  notifications: number;
  messages: number;
};

type Ctx = {
  lock: StudyLock | null;
  /** Milliseconds left on the server clock (0 when not locked) */
  remainingMs: number;
  ready: boolean;
  start: (minutes: number, label: string) => Promise<string | null>;
  refresh: () => Promise<boolean>;
  /** Marks one screen path (like the AI tutor chat) as open during the lock */
  allowPath: (path: string) => void;
};

const StudyLockContext = createContext<Ctx>({
  lock: null,
  remainingMs: 0,
  ready: true,
  start: async () => "Not ready",
  refresh: async () => false,
  allowPath: () => undefined,
});

export const useStudyLock = () => useContext(StudyLockContext);

const cacheKey = (uid: string) => `study-lock:${uid}`;

/**
 * While the lock is on, study tools stay open and everything that can distract
 * (chat, marketplace, housing, food, wallet, notifications, profile...) is covered.
 */
const OPEN_PATHS = new Set(["/", "/ai", "/settings", "/study-lock", "/inbox/ai-profile", "/inbox/ai-avatar", "/login", "/signup", "/onboarding"]);

function isStudyPath(path: string) {
  return OPEN_PATHS.has(path) || path === "/study" || path.startsWith("/study/");
}

type Active = { id: string; label: string | null; minutes: number; started_at: string; ends_at: string };

function toLock(a: Active): StudyLock {
  return {
    id: a.id,
    label: a.label,
    minutes: a.minutes,
    startedAt: new Date(a.started_at).getTime(),
    endsAt: new Date(a.ends_at).getTime(),
  };
}

export function StudyLockProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [lock, setLock] = useState<StudyLock | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [summary, setSummary] = useState<LockSummary | null>(null);
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<string[]>([]);
  const offset = useRef(0);
  const checking = useRef(false);

  const apply = useCallback(
    async (next: StudyLock | null, offsetMs: number) => {
      offset.current = offsetMs;
      setLock(next);
      if (!uid) return;
      if (next) await AsyncStorage.setItem(cacheKey(uid), JSON.stringify({ lock: next, offset: offsetMs }));
      else await AsyncStorage.removeItem(cacheKey(uid));
    },
    [uid],
  );

  const refresh = useCallback(async () => {
    if (!uid) return false;
    const { data, error } = await supabase.rpc("my_study_lock");
    if (error || !data) return false;
    const d = data as { server_now: string; active: Active | null; finished: LockSummary | null };
    const off = new Date(d.server_now).getTime() - Date.now();
    await apply(d.active ? toLock(d.active) : null, off);
    if (d.finished) setSummary(d.finished);
    return true;
  }, [uid, apply]);

  // Load the saved copy first (so the lock shows instantly), then ask the server.
  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    if (!uid) {
      setLock(null);
      setReady(true);
      return;
    }
    setReady(false);
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey(uid));
        if (raw && !cancelled) {
          const saved = JSON.parse(raw) as { lock: StudyLock; offset: number };
          offset.current = saved.offset ?? 0;
          setLock(saved.lock);
        }
      } catch {
        // ignore a broken cache
      }
      if (!cancelled) setReady(true);
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Tick every second while locked; re-check the server every minute.
  useEffect(() => {
    if (!lock) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const sync = setInterval(() => void refresh(), 60_000);
    return () => {
      clearInterval(tick);
      clearInterval(sync);
    };
  }, [lock, refresh]);

  const remainingMs = lock ? Math.max(0, lock.endsAt - (now + offset.current)) : 0;

  // Time is up on this phone: let the server confirm (it unlocks and reports what you missed).
  useEffect(() => {
    if (!lock || remainingMs > 0 || checking.current) return;
    checking.current = true;
    void refresh()
      .then(async (ok) => {
        if (!ok) await apply(null, offset.current); // offline: trust the clock
      })
      .finally(() => {
        checking.current = false;
      });
  }, [lock, remainingMs, refresh, apply]);

  const allowPath = useCallback((path: string) => {
    setAllowed((prev) => (prev.includes(path) ? prev : [...prev.slice(-9), path]));
  }, []);

  const blocked = !!lock && !isStudyPath(pathname) && !allowed.includes(pathname);

  // On a locked screen, back takes you to the study tools instead of out of the lock.
  useEffect(() => {
    if (!blocked) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      router.replace("/(tabs)/study");
      return true;
    });
    return () => sub.remove();
  }, [blocked]);

  const start = useCallback(
    async (minutes: number, label: string) => {
      const { data, error } = await supabase.rpc("start_study_lock", { p_minutes: minutes, p_label: label.trim() || null });
      if (error) return error.message;
      const d = data as Active & { server_now: string };
      await apply(toLock(d), new Date(d.server_now).getTime() - Date.now());
      setNow(Date.now());
      return null;
    },
    [apply],
  );

  const value = useMemo<Ctx>(() => ({ lock, remainingMs, ready, start, refresh, allowPath }), [lock, remainingMs, ready, start, refresh, allowPath]);

  return (
    <StudyLockContext.Provider value={value}>
      {children}
      <LockOverlay lock={lock} blocked={blocked} onTimerScreen={pathname === "/study-lock"} remainingMs={remainingMs} ready={ready} signedIn={!!uid} summary={summary} onDismiss={() => setSummary(null)} />
    </StudyLockContext.Provider>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function LockOverlay({
  lock,
  blocked,
  onTimerScreen,
  remainingMs,
  ready,
  signedIn,
  summary,
  onDismiss,
}: {
  lock: StudyLock | null;
  blocked: boolean;
  onTimerScreen: boolean;
  remainingMs: number;
  ready: boolean;
  signedIn: boolean;
  summary: LockSummary | null;
  onDismiss: () => void;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  if (signedIn && !ready) return <View style={[styles.fill, { backgroundColor: colors.bg }]} pointerEvents="auto" />;

  if (lock && !blocked) {
    // Study screens stay open: just a small timer chip that opens the lock screen.
    if (onTimerScreen) return null;
    return (
      <Pressable
        onPress={() => router.push("/study-lock")}
        style={[styles.chip, { backgroundColor: colors.heroBg, bottom: insets.bottom + 96 }]}
        accessibilityLabel="Study lock timer"
      >
        <Ionicons name="lock-closed" size={13} color={colors.heroFg} />
        <AppText size={12} weight="700" style={{ color: colors.heroFg }}>
          {formatClock(remainingMs)}
        </AppText>
      </Pressable>
    );
  }

  if (lock) {
    const total = Math.max(1, lock.endsAt - lock.startedAt);
    const done = Math.min(1, Math.max(0, 1 - remainingMs / total));
    const endsAt = new Date(lock.endsAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return (
      <View style={[styles.fill, { backgroundColor: colors.heroBg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.center}>
          <View style={[styles.lockIcon, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
            <Ionicons name="lock-closed" size={30} color={colors.heroFg} />
          </View>
          <AppText size={15} weight="600" style={{ color: colors.heroMuted }}>
            {lock.label ? `Studying: ${lock.label}` : "Study time"}
          </AppText>
          <AppText size={56} weight="700" style={{ color: colors.heroFg, lineHeight: 66, letterSpacing: 1 }}>
            {formatClock(remainingMs)}
          </AppText>
          <View style={[styles.track, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
            <View style={{ width: `${Math.round(done * 100)}%`, height: "100%", borderRadius: 4, backgroundColor: colors.accent }} />
          </View>
          <AppText size={13} style={{ color: colors.heroMuted }}>
            Unlocks at {endsAt}
          </AppText>
        </View>
        <View style={{ gap: 12, paddingHorizontal: 8 }}>
          <AppText size={13} style={{ color: colors.heroMuted, textAlign: "center" }}>
            This screen can distract you, so it's locked until the timer ends. Your study tools are still open.
          </AppText>
          <Button title="Open study tools" onPress={() => router.replace("/(tabs)/study")} />
        </View>
      </View>
    );
  }
  if (summary) {
    const missed = summary.messages + summary.notifications;
    return (
      <View style={[styles.fill, { backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 }]}>
        <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
          <View style={[styles.lockIcon, { backgroundColor: colors.soft }]}>
            <Ionicons name="checkmark" size={30} color={colors.success} />
          </View>
          <AppText size={22} weight="700" style={{ textAlign: "center" }}>
            Well done!
          </AppText>
          <AppText muted style={{ textAlign: "center" }}>
            You studied for {formatMinutes(summary.minutes)}
            {summary.label ? ` (${summary.label})` : ""}. It's saved in your study log.
          </AppText>
          <View style={[styles.missed, { backgroundColor: colors.surface }]}>
            <AppText weight="700">While you were focused</AppText>
            <AppText muted size={14}>
              {missed === 0
                ? "Nothing new came in."
                : `${summary.messages} new message${summary.messages === 1 ? "" : "s"} and ${summary.notifications} notification${summary.notifications === 1 ? "" : "s"}.`}
            </AppText>
          </View>
          {summary.messages > 0 ? (
            <Button
              title="Open my messages"
              onPress={() => {
                onDismiss();
                router.push("/(tabs)/inbox");
              }}
            />
          ) : null}
          <Button variant={summary.messages > 0 ? "secondary" : "primary"} title="Continue" onPress={onDismiss} />
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999 },
  chip: { position: "absolute", right: 14, zIndex: 9000, elevation: 9000, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  lockIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  track: { width: "80%", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 10 },
  sheet: { borderRadius: radii.xl, padding: 24, gap: 14 },
  missed: { borderRadius: radii.md, padding: 14, gap: 4 },
});
