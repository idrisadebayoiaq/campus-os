import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Group, ListRow, Notice, PageShell, Section, Segmented } from "@/src/components/page";
import { AppText, Button, Input } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import { notify, toast } from "@/src/lib/feedback";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const INTERESTS = [
  { value: "housing", label: "Housing" },
  { value: "study", label: "Study tools" },
  { value: "food", label: "Food" },
  { value: "marketplace", label: "Shopping" },
  { value: "guides", label: "Guides" },
];

const AI_STYLES = [
  { value: "simple", label: "Simple" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

type NotifKey =
  | "channel_push"
  | "academic_reminders"
  | "lecture_alerts"
  | "examination_alerts"
  | "study_group_messages"
  | "housing_alerts"
  | "campus_announcements"
  | "marketing_email";
type NotifState = Record<NotifKey, boolean>;

const DEFAULT_NOTIFS: NotifState = {
  channel_push: true,
  academic_reminders: true,
  lecture_alerts: true,
  examination_alerts: true,
  study_group_messages: true,
  housing_alerts: true,
  campus_announcements: true,
  marketing_email: false,
};

const NOTIF_ROWS: { key: NotifKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "academic_reminders", label: "Deadlines", icon: "alarm-outline" },
  { key: "lecture_alerts", label: "Classes", icon: "school-outline" },
  { key: "examination_alerts", label: "Exams", icon: "document-text-outline" },
  { key: "study_group_messages", label: "Study groups", icon: "people-outline" },
  { key: "housing_alerts", label: "Room matches", icon: "home-outline" },
  { key: "campus_announcements", label: "Announcements", icon: "megaphone-outline" },
  { key: "marketing_email", label: "Offers by email", icon: "mail-outline" },
];

async function saveRow(table: "student_preferences" | "notification_preferences", userId: string, payload: Record<string, unknown>) {
  const row = { user_id: userId, ...payload, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from(table).update(row).eq("user_id", userId).select("user_id");
  if (!error && data?.length) return null;
  const ins = await supabase.from(table).insert(row);
  return ins.error;
}

export default function PreferencesScreen() {
  const colors = useTheme();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [interests, setInterests] = useState<string[]>([]);
  const [goal, setGoal] = useState("");
  const [aiStyle, setAiStyle] = useState("balanced");
  const [notifs, setNotifs] = useState<NotifState>(DEFAULT_NOTIFS);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [prefsRes, notifRes] = await Promise.all([
      supabase.from("student_preferences").select("interests, primary_academic_goal, ai_explanation_style").eq("user_id", user.id).maybeSingle(),
      supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    const p = prefsRes.data;
    if (p) {
      setInterests(Array.isArray(p.interests) ? (p.interests as string[]) : []);
      setGoal(String(p.primary_academic_goal ?? ""));
      setAiStyle(String(p.ai_explanation_style ?? "balanced"));
    }
    const n = notifRes.data as Partial<NotifState> | null;
    if (n) {
      const next = { ...DEFAULT_NOTIFS };
      for (const k of Object.keys(DEFAULT_NOTIFS) as NotifKey[]) if (typeof n[k] === "boolean") next[k] = n[k] as boolean;
      setNotifs(next);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function flip(key: NotifKey, value: boolean) {
    if (!user) return;
    const next = { ...notifs, [key]: value };
    setNotifs(next);
    const err = await saveRow("notification_preferences", user.id, next);
    if (err) {
      setNotifs(notifs);
      notify("Couldn't update", err.message, undefined, { tone: "danger" });
    }
  }

  async function saveStudy() {
    if (!user) return;
    setSaving(true);
    const err = await saveRow("student_preferences", user.id, {
      interests,
      primary_academic_goal: goal.trim() || null,
      ai_explanation_style: aiStyle,
    });
    setSaving(false);
    if (err) notify("Couldn't save", err.message, undefined, { tone: "danger" });
    else toast.success("Saved");
  }

  return (
    <PageShell title="Study & alerts" loading={loading}>
      <Notice icon="shield-checkmark-outline">
        Wallet, orders, purchases, housing, school and account updates always send. You can switch off the reminders below.
      </Notice>

      <Section title="Alert me about">
        <Group>
          <ListRow
            icon="chatbubble-ellipses-outline"
            title="Chat messages"
            chevron={false}
            right={<Switch value={notifs.channel_push} onValueChange={(v) => void flip("channel_push", v)} trackColor={{ true: colors.accent, false: colors.border }} />}
          />
          {NOTIF_ROWS.map((r) => (
            <ListRow
              key={r.key}
              icon={r.icon}
              title={r.label}
              chevron={false}
              right={<Switch value={notifs[r.key]} onValueChange={(v) => void flip(r.key, v)} trackColor={{ true: colors.accent, false: colors.border }} />}
            />
          ))}
        </Group>
      </Section>

      <Section title="Tutor explanations">
        <Segmented value={aiStyle} onChange={setAiStyle} options={AI_STYLES} />
      </Section>

      <Section title="Main goal">
        <Input value={goal} onChangeText={setGoal} placeholder="e.g. 4.0 CGPA this session" maxLength={120} />
      </Section>

      <Section title="Interests">
        <View style={styles.chips}>
          {INTERESTS.map((o) => {
            const on = interests.includes(o.value);
            return (
              <Pressable
                key={o.value}
                onPress={() => setInterests((prev) => (on ? prev.filter((v) => v !== o.value) : [...prev, o.value]))}
                style={[styles.chip, { backgroundColor: on ? colors.inverseBg : colors.surface }]}
              >
                <AppText size={13} weight="600" style={{ color: on ? colors.inverseFg : colors.fg }}>
                  {o.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Button title="Save study settings" variant="secondary" onPress={() => void saveStudy()} loading={saving} />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill },
});
