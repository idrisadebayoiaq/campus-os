import { useCallback, useEffect, useState } from "react";
import { Switch, View } from "react-native";
import {
  AppText,
  Button,
  Card,
  Chip,
  Field,
  Input,
} from "@/src/components/ui";
import { StudyShell, SyncBanner } from "@/src/components/study";
import { useAuth } from "@/src/lib/auth";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const INTERESTS = [
  { value: "housing", label: "Housing" },
  { value: "study", label: "Study tools" },
  { value: "food", label: "Food" },
  { value: "marketplace", label: "Campus shopping" },
  { value: "guides", label: "Campus guides" },
] as const;

const AI_STYLES = [
  { value: "simple", label: "Simple" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
] as const;

type NotifState = {
  academic_reminders: boolean;
  lecture_alerts: boolean;
  examination_alerts: boolean;
  housing_alerts: boolean;
  food_order_alerts: boolean;
  marketing_email: boolean;
};

const DEFAULT_NOTIFS: NotifState = {
  academic_reminders: true,
  lecture_alerts: true,
  examination_alerts: true,
  housing_alerts: true,
  food_order_alerts: false,
  marketing_email: false,
};

export default function PreferencesScreen() {
  const colors = useTheme();
  const { user } = useAuth();
  const [interests, setInterests] = useState<string[]>([]);
  const [goal, setGoal] = useState("");
  const [aiStyle, setAiStyle] = useState("balanced");
  const [notifs, setNotifs] = useState<NotifState>(DEFAULT_NOTIFS);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [prefsRes, notifRes] = await Promise.all([
      supabase
        .from("student_preferences")
        .select("interests, primary_academic_goal, ai_explanation_style")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    const p = prefsRes.data;
    if (p) {
      setInterests(Array.isArray(p.interests) ? (p.interests as string[]) : []);
      setGoal(String(p.primary_academic_goal ?? ""));
      setAiStyle(String(p.ai_explanation_style ?? "balanced"));
    }
    const n = notifRes.data as Partial<NotifState> | null;
    if (n) {
      setNotifs({
        academic_reminders: n.academic_reminders ?? true,
        lecture_alerts: n.lecture_alerts ?? true,
        examination_alerts: n.examination_alerts ?? true,
        housing_alerts: n.housing_alerts ?? true,
        food_order_alerts: n.food_order_alerts ?? false,
        marketing_email: n.marketing_email ?? false,
      });
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleInterest(value: string) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function savePrefs() {
    if (!user) return;
    setSaving("prefs");
    setStatus(null);
    setError(null);
    const payload = {
      user_id: user.id,
      interests,
      primary_academic_goal: goal.trim() || null,
      ai_explanation_style: aiStyle,
      updated_at: new Date().toISOString(),
    };
    let { error: updErr } = await supabase
      .from("student_preferences")
      .update(payload)
      .eq("user_id", user.id);
    if (updErr) {
      ({ error: updErr } = await supabase.from("student_preferences").insert(payload));
    } else {
      const { data } = await supabase
        .from("student_preferences")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) {
        ({ error: updErr } = await supabase.from("student_preferences").insert(payload));
      }
    }
    setSaving(null);
    if (updErr) setError(updErr.message);
    else setStatus("Preferences saved.");
  }

  async function saveNotifs() {
    if (!user) return;
    setSaving("notifs");
    setStatus(null);
    setError(null);
    const payload = {
      user_id: user.id,
      ...notifs,
      updated_at: new Date().toISOString(),
    };
    let { error: updErr } = await supabase
      .from("notification_preferences")
      .update(payload)
      .eq("user_id", user.id);
    if (updErr) {
      ({ error: updErr } = await supabase
        .from("notification_preferences")
        .insert(payload));
    } else {
      const { data } = await supabase
        .from("notification_preferences")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) {
        ({ error: updErr } = await supabase
          .from("notification_preferences")
          .insert(payload));
      }
    }
    setSaving(null);
    if (updErr) setError(updErr.message);
    else setStatus("Notification settings saved.");
  }

  return (
    <StudyShell
      title="Preferences"
      subtitle="Interests, AI style, and alerts"
      banner={<SyncBanner error={error} notice={status} />}
    >
      <View
        style={{
          backgroundColor: colors.heroBg,
          borderRadius: radii.xl,
          padding: 20,
          gap: 6,
        }}
      >
        <AppText size={13} style={{ color: colors.heroMuted }}>
          Personalise CampusOS
        </AppText>
        <AppText size={18} weight="700" style={{ color: colors.heroFg }}>
          Study style and notifications
        </AppText>
      </View>

      <Card style={{ gap: 12 }}>
        <AppText weight="700">Interests</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {INTERESTS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              active={interests.includes(opt.value)}
              onPress={() => toggleInterest(opt.value)}
            />
          ))}
        </View>

        <Field label="Primary academic goal">
          <Input
            value={goal}
            onChangeText={setGoal}
            placeholder="e.g. Raise CGPA to 4.0"
          />
        </Field>

        <AppText weight="700">AI explanation style</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {AI_STYLES.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              active={aiStyle === opt.value}
              onPress={() => setAiStyle(opt.value)}
            />
          ))}
        </View>
        <Button
          title="Save preferences"
          onPress={savePrefs}
          loading={saving === "prefs"}
        />
      </Card>

      <Card style={{ gap: 10 }}>
        <AppText weight="700">Notifications</AppText>
        {(
          [
            ["academic_reminders", "Academic reminders"],
            ["lecture_alerts", "Lecture alerts"],
            ["examination_alerts", "Examination alerts"],
            ["housing_alerts", "Housing alerts"],
            ["food_order_alerts", "Food order alerts"],
            ["marketing_email", "Marketing email"],
          ] as const
        ).map(([key, label]) => (
          <View
            key={key}
            style={{
              minHeight: 48,
              borderRadius: radii.md,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.bg,
            }}
          >
            <AppText size={14} style={{ flex: 1 }}>
              {label}
            </AppText>
            <Switch
              value={notifs[key]}
              onValueChange={(v) => setNotifs((prev) => ({ ...prev, [key]: v }))}
              trackColor={{ true: colors.accent, false: colors.border }}
            />
          </View>
        ))}
        <Button
          title="Save notifications"
          onPress={saveNotifs}
          loading={saving === "notifs"}
        />
      </Card>
    </StudyShell>
  );
}
