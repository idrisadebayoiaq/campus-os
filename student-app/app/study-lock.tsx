import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, Button, Input } from "@/src/components/ui";
import { Group, ListRow, PageShell, ScrollChips, Section } from "@/src/components/page";
import { useAuth } from "@/src/lib/auth";
import { notify } from "@/src/lib/feedback";
import { scheduleLocal } from "@/src/lib/push";
import { formatClock, formatMinutes, useStudyLock } from "@/src/lib/study-lock";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Past = { id: string; label: string | null; minutes: number; started_at: string; ends_at: string };

const PRESETS = [
  { value: "30", label: "30m" },
  { value: "60", label: "1h" },
  { value: "90", label: "1h 30m" },
  { value: "120", label: "2h" },
  { value: "180", label: "3h" },
  { value: "240", label: "4h" },
];

const LOCKED: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "chatbubbles-outline", label: "Chat" },
  { icon: "storefront-outline", label: "Market" },
  { icon: "home-outline", label: "Housing" },
  { icon: "wallet-outline", label: "Wallet" },
  { icon: "notifications-outline", label: "Alerts" },
];

const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default function StudyLockScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const { start, lock, remainingMs } = useStudyLock();
  const [minutes, setMinutes] = useState(120);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [past, setPast] = useState<Past[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("study_locks")
      .select("id, label, minutes, started_at, ends_at")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(10);
    setPast((data as Past[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const weekMinutes = useMemo(
    () =>
      past
        .filter((p) => new Date(p.ends_at).getTime() <= now && now - new Date(p.started_at).getTime() < 7 * 86400_000)
        .reduce((sum, p) => sum + p.minutes, 0),
    [past, now],
  );

  const step = (d: number) => setMinutes((m) => Math.min(480, Math.max(15, m + d)));

  function confirm() {
    notify(`Lock for ${formatMinutes(minutes)}?`, `Unlocks at ${time(Date.now() + minutes * 60_000)}. You can't end it early.`, [
      { text: "Not now", style: "cancel" },
      {
        text: "Start",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          const err = await start(minutes, label);
          setBusy(false);
          if (err) notify("Couldn't start", err, undefined, { tone: "danger" });
          else void scheduleLocal("study-lock", new Date(Date.now() + minutes * 60_000), "Study lock is over", "Everything is unlocked. Well done.", "/(tabs)");
        },
      },
    ]);
  }

  if (lock) {
    const total = Math.max(1, lock.endsAt - lock.startedAt);
    const pct = Math.min(1, Math.max(0, 1 - remainingMs / total));
    return (
      <PageShell title="Study lock">
        <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
          <Ionicons name="lock-closed" size={28} color={colors.accent} />
          <AppText size={52} weight="700" style={{ color: colors.heroFg, fontVariant: ["tabular-nums"] }}>
            {formatClock(remainingMs)}
          </AppText>
          <AppText size={14} style={{ color: colors.heroMuted }}>
            {lock.label ? `${lock.label} · ` : ""}Unlocks at {time(lock.endsAt)}
          </AppText>
          <View style={[styles.track, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
            <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: colors.accent }]} />
          </View>
        </View>
        <Button title="Open study tools" onPress={() => router.replace("/(tabs)/study")} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Study lock"
      loading={loading}
      footer={<Button title={`Start · ${formatMinutes(minutes)}`} onPress={confirm} loading={busy} />}
    >
      <View style={[styles.hero, { backgroundColor: colors.heroBg }]}>
        <View style={styles.stepRow}>
          <Pressable onPress={() => step(-15)} style={[styles.stepBtn, { backgroundColor: "rgba(255,255,255,0.12)" }]} accessibilityLabel="15 minutes less">
            <Ionicons name="remove" size={22} color={colors.heroFg} />
          </Pressable>
          <View style={{ alignItems: "center", minWidth: 150 }}>
            <AppText size={44} weight="700" style={{ color: colors.heroFg }}>
              {formatMinutes(minutes)}
            </AppText>
            <AppText size={13} style={{ color: colors.heroMuted }}>
              Until {time(now + minutes * 60_000)}
            </AppText>
          </View>
          <Pressable onPress={() => step(15)} style={[styles.stepBtn, { backgroundColor: "rgba(255,255,255,0.12)" }]} accessibilityLabel="15 minutes more">
            <Ionicons name="add" size={22} color={colors.heroFg} />
          </Pressable>
        </View>
      </View>

      <ScrollChips options={PRESETS} value={String(minutes)} onChange={(v) => setMinutes(Number(v))} />

      <Input value={label} onChangeText={setLabel} maxLength={60} placeholder="What are you studying? (optional)" />

      <Section title="Paused during the lock">
        <View style={styles.locked}>
          {LOCKED.map((l) => (
            <View key={l.label} style={styles.lockedItem}>
              <View style={[styles.lockedIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name={l.icon} size={20} color={colors.muted} />
              </View>
              <AppText size={11} muted>
                {l.label}
              </AppText>
            </View>
          ))}
        </View>
      </Section>

      {past.length ? (
        <Section title="Recent" hint={weekMinutes ? `${formatMinutes(weekMinutes)} this week` : undefined}>
          <Group>
            {past.slice(0, 5).map((p) => {
              const running = new Date(p.ends_at).getTime() > now;
              return (
                <ListRow
                  key={p.id}
                  icon="timer-outline"
                  title={p.label || formatMinutes(p.minutes)}
                  subtitle={new Date(p.started_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  value={running ? "Running" : formatMinutes(p.minutes)}
                  valueTone={running ? "warn" : "neutral"}
                />
              );
            })}
          </Group>
        </Section>
      ) : null}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.xl, padding: 24, alignItems: "center", gap: 8 },
  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch" },
  stepBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  track: { height: 6, borderRadius: 3, alignSelf: "stretch", overflow: "hidden", marginTop: 10 },
  fill: { height: 6, borderRadius: 3 },
  locked: { flexDirection: "row", justifyContent: "space-between" },
  lockedItem: { alignItems: "center", gap: 6, flex: 1 },
  lockedIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
