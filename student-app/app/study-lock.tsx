import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { Button, Field, Input } from "@/src/components/ui";
import { ChipRow, Group, Hero, ListRow, Notice, PageShell, Section } from "@/src/components/page";
import { useAuth } from "@/src/lib/auth";
import { formatMinutes, useStudyLock } from "@/src/lib/study-lock";
import { supabase } from "@/src/lib/supabase";

type Past = { id: string; label: string | null; minutes: number; started_at: string; ends_at: string };

const PRESETS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
  { value: "custom", label: "Custom" },
];

export default function StudyLockScreen() {
  const { user } = useAuth();
  const { start } = useStudyLock();
  const [choice, setChoice] = useState("120");
  const [custom, setCustom] = useState("90");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [past, setPast] = useState<Past[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("study_locks")
      .select("id, label, minutes, started_at, ends_at")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(15);
    setPast((data as Past[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const minutes = choice === "custom" ? Math.round(Number(custom.replace(/[^0-9]/g, "")) || 0) : Number(choice);
  const problem = minutes < 15 ? "Choose at least 15 minutes." : minutes > 480 ? "The longest study lock is 8 hours." : null;
  const endsAt = useMemo(
    () => new Date(Date.now() + minutes * 60_000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    [minutes],
  );

  const weekMinutes = past
    .filter((p) => new Date(p.ends_at).getTime() <= Date.now() && Date.now() - new Date(p.started_at).getTime() < 7 * 86400_000)
    .reduce((sum, p) => sum + p.minutes, 0);

  function confirm() {
    if (problem) return;
    Alert.alert(
      `Lock CampusOS for ${formatMinutes(minutes)}?`,
      `You won't be able to open chat, notifications or anything else in CampusOS until ${endsAt}. You can't end it early. Everything will be waiting when the timer ends.`,
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Start lock",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            setError(null);
            const err = await start(minutes, label);
            setBusy(false);
            if (err) setError(err);
          },
        },
      ],
    );
  }

  return (
    <PageShell
      title="Study lock"
      subtitle="Block distractions until your timer ends"
      loading={loading}
      footer={<Button title={busy ? "Starting…" : `Start lock · ${formatMinutes(Math.max(minutes, 0))}`} onPress={confirm} disabled={!!problem} loading={busy} />}
    >
      <Hero label="Studied this week with the lock" value={formatMinutes(weekMinutes)} note="Finished sessions are added to your study log." />

      <Notice icon="lock-closed-outline">
        While the lock is on, CampusOS shows only a countdown. Chat, notifications and every other screen are paused, and you can't unlock it early. When the time ends, everything comes back.
      </Notice>

      <Section title="How long do you want to study?">
        <ChipRow options={PRESETS} value={choice} onChange={setChoice} />
        {choice === "custom" ? (
          <Field label="Minutes" hint="Between 15 and 480 (8 hours)">
            <Input value={custom} onChangeText={setCustom} keyboardType="number-pad" maxLength={3} />
          </Field>
        ) : null}
      </Section>

      <Section title="What are you studying?" hint="Optional. Shown on the lock screen and in your log">
        <Input value={label} onChangeText={setLabel} maxLength={60} placeholder="e.g. MTH 201 revision" />
      </Section>

      {problem ? <Notice tone="danger">{problem}</Notice> : <Notice icon="time-outline">{`If you start now, CampusOS unlocks at ${endsAt}.`}</Notice>}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {past.length ? (
        <Section title="Recent sessions">
          <Group>
            {past.map((p) => (
              <ListRow
                key={p.id}
                icon="timer-outline"
                title={`${formatMinutes(p.minutes)}${p.label ? ` · ${p.label}` : ""}`}
                subtitle={new Date(p.started_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                value={new Date(p.ends_at).getTime() > Date.now() ? "Running" : "Done"}
                valueTone={new Date(p.ends_at).getTime() > Date.now() ? "warn" : "success"}
              />
            ))}
          </Group>
        </Section>
      ) : null}
    </PageShell>
  );
}
