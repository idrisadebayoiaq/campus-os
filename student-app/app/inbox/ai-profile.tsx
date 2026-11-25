import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Avatar, Button } from "@/src/components/ui";
import { useAuth } from "@/src/lib/auth";
import type { AiCompanionProfile } from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

const REPLY_MODES = [
  { value: "text_only", label: "Text only" },
  { value: "voice_only", label: "Voice only" },
] as const;

const STYLES = [
  { value: "simple", label: "Simple" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
] as const;

const PERSONALITIES = [
  { value: "friendly", label: "Friendly" },
  { value: "strict_tutor", label: "Strict tutor" },
  { value: "concise", label: "Concise" },
] as const;

export default function AiProfileScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<AiCompanionProfile | null>(null);
  const [name, setName] = useState("CampusOS Tutor");
  const [replyMode, setReplyMode] = useState<"text_only" | "voice_only">(
    "text_only",
  );
  const [style, setStyle] = useState<"simple" | "balanced" | "detailed">(
    "balanced",
  );
  const [personality, setPersonality] = useState<
    "friendly" | "strict_tutor" | "concise"
  >("friendly");
  const [language, setLanguage] = useState("auto");
  const [useCourse, setUseCourse] = useState(true);
  const [saveHistory, setSaveHistory] = useState(true);
  const [speechRate, setSpeechRate] = useState("1.0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    let q = supabase
      .from("ai_companion_profiles")
      .select("*")
      .eq("user_id", user.id);
    if (conversationId) q = q.eq("conversation_id", conversationId);
    const { data } = await q.maybeSingle();
    if (!data) return;
    const p = data as AiCompanionProfile;
    setProfile(p);
    setName(p.display_name || "CampusOS Tutor");
    setReplyMode(p.reply_mode || "text_only");
    setStyle(p.explanation_style || "balanced");
    setPersonality(p.personality || "friendly");
    setLanguage(p.language || "auto");
    setUseCourse(p.use_course_context !== false);
    setSaveHistory(p.save_history !== false);
    setSpeechRate(String(p.speech_rate ?? 1));
    setNotes(p.system_notes || "");
  }, [user, conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!user || !profile) return;
    setSaving(true);
    setStatus(null);
    const payload = {
      display_name: name.trim() || "CampusOS Tutor",
      reply_mode: replyMode,
      explanation_style: style,
      personality,
      language: language.trim() || "auto",
      use_course_context: useCourse,
      save_history: saveHistory,
      speech_rate: Number(speechRate) || 1,
      system_notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("ai_companion_profiles")
      .update(payload)
      .eq("id", profile.id);
    if (!error) {
      await supabase
        .from("conversations")
        .update({ subject: payload.display_name })
        .eq("id", profile.conversation_id);
      await supabase.from("student_preferences").upsert({
        user_id: user.id,
        ai_explanation_style: style,
        updated_at: new Date().toISOString(),
      });
    }
    setSaving(false);
    setStatus(error ? error.message : "AI profile saved.");
  }

  function ChipRow<T extends string>({
    options,
    value,
    onChange,
  }: {
    options: readonly { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
  }) {
    return (
      <View style={styles.chips}>
        {options.map((opt) => {
          const on = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[
                styles.chip,
                { backgroundColor: on ? colors.accent : colors.surface },
              ]}
            >
              <AppText
                size={13}
                weight="600"
                style={{ color: on ? colors.onAccent : colors.fg }}
              >
                {opt.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}
    >
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          AI profile
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 14,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.identity}>
          <Avatar label={name} size={88} uri={profile?.avatar_url} />
          <AppText muted size={13} style={{ marginTop: 8 }}>
            Your personal CampusOS tutor
          </AppText>
        </View>

        <AppText weight="600" size={13}>
          Display name
        </AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          style={[
            styles.input,
            { backgroundColor: colors.surface, color: colors.fg },
          ]}
        />

        <AppText weight="600" size={13}>
          Reply mode
        </AppText>
        <AppText muted size={12}>
          You always type. AI replies with text or voice only.
        </AppText>
        <ChipRow
          options={REPLY_MODES}
          value={replyMode}
          onChange={setReplyMode}
        />

        <AppText weight="600" size={13}>
          Explanation style
        </AppText>
        <ChipRow options={STYLES} value={style} onChange={setStyle} />

        <AppText weight="600" size={13}>
          Personality
        </AppText>
        <ChipRow
          options={PERSONALITIES}
          value={personality}
          onChange={setPersonality}
        />

        <AppText weight="600" size={13}>
          Language
        </AppText>
        <TextInput
          value={language}
          onChangeText={setLanguage}
          placeholder="auto"
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            { backgroundColor: colors.surface, color: colors.fg },
          ]}
        />

        <View style={[styles.switchRow, { backgroundColor: colors.surface }]}>
          <AppText style={{ flex: 1 }}>Use my courses as context</AppText>
          <Switch
            value={useCourse}
            onValueChange={setUseCourse}
            trackColor={{ true: colors.accent }}
          />
        </View>
        <View style={[styles.switchRow, { backgroundColor: colors.surface }]}>
          <AppText style={{ flex: 1 }}>Save chat history</AppText>
          <Switch
            value={saveHistory}
            onValueChange={setSaveHistory}
            trackColor={{ true: colors.accent }}
          />
        </View>

        <AppText weight="600" size={13}>
          Speech rate (voice replies)
        </AppText>
        <TextInput
          value={speechRate}
          onChangeText={setSpeechRate}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            { backgroundColor: colors.surface, color: colors.fg },
          ]}
        />

        <AppText weight="600" size={13}>
          Notes for the AI (about you)
        </AppText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="e.g. I'm in 200L Computer Science…"
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              color: colors.fg,
              height: 100,
              textAlignVertical: "top",
              paddingTop: 12,
            },
          ]}
        />

        <Button title="Save" onPress={save} loading={saving} />
        {status ? (
          <AppText
            size={13}
            style={{
              color: status.includes("saved") ? colors.success : colors.danger,
            }}
          >
            {status}
          </AppText>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  identity: { alignItems: "center", marginBottom: 8 },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  switchRow: {
    minHeight: 52,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
});
