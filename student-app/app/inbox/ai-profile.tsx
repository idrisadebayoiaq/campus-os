import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { AppText, Button } from "@/src/components/ui";
import { AiAvatar, aiAvatarFor } from "@/src/lib/ai-avatars";
import { useAuth } from "@/src/lib/auth";
import { ensureAiConversation, type AiCompanionProfile } from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

type Option<T extends string> = { value: T; label: string };

const REPLY_MODES: Option<"text_only" | "voice_only">[] = [
  { value: "text_only", label: "Text" },
  { value: "voice_only", label: "Voice" },
];

const STYLES: Option<"simple" | "balanced" | "detailed">[] = [
  { value: "simple", label: "Simple" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

const PERSONALITIES: Option<"friendly" | "strict_tutor" | "concise">[] = [
  { value: "friendly", label: "Friendly" },
  { value: "strict_tutor", label: "Strict" },
  { value: "concise", label: "Concise" },
];

const LANGUAGES: Option<string>[] = [
  { value: "auto", label: "Auto" },
  { value: "English", label: "English" },
  { value: "Pidgin", label: "Pidgin" },
  { value: "Yoruba", label: "Yoruba" },
  { value: "Igbo", label: "Igbo" },
  { value: "Hausa", label: "Hausa" },
  { value: "French", label: "French" },
];

const SPEEDS: Option<string>[] = [
  { value: "0.75", label: "0.75×" },
  { value: "1", label: "1×" },
  { value: "1.25", label: "1.25×" },
  { value: "1.5", label: "1.5×" },
];

export default function AiProfileScreen() {
  const { user } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<AiCompanionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const [name, setName] = useState("CampusOS Tutor");
  const [replyMode, setReplyMode] = useState<"text_only" | "voice_only">("text_only");
  const [style, setStyle] = useState<"simple" | "balanced" | "detailed">("balanced");
  const [personality, setPersonality] = useState<"friendly" | "strict_tutor" | "concise">(
    "friendly",
  );
  const [language, setLanguage] = useState("auto");
  const [useCourse, setUseCourse] = useState(true);
  const [saveHistory, setSaveHistory] = useState(true);
  const [speechRate, setSpeechRate] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const { profile: p } = await ensureAiConversation(supabase, user.id);
        if (cancelled) return;
        setProfile(p);
        setAvatarKey(p.avatar_url);
        setName(p.display_name || "CampusOS Tutor");
        setReplyMode(p.reply_mode || "text_only");
        setStyle(p.explanation_style || "balanced");
        setPersonality(p.personality || "friendly");
        setLanguage(p.language || "auto");
        setUseCourse(p.use_course_context !== false);
        setSaveHistory(p.save_history !== false);
        setSpeechRate(String(Number(p.speech_rate ?? 1)));
        setNotes(p.system_notes || "");
      } catch (e) {
        if (!cancelled) {
          setStatus({ ok: false, text: e instanceof Error ? e.message : "Could not load AI profile." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      void supabase
        .from("ai_companion_profiles")
        .select("avatar_url")
        .eq("id", profile.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setAvatarKey((data.avatar_url as string | null) ?? null);
        });
    }, [profile]),
  );

  async function save() {
    if (!user || !profile) return;
    setSaving(true);
    setStatus(null);
    const payload = {
      display_name: name.trim() || "CampusOS Tutor",
      reply_mode: replyMode,
      explanation_style: style,
      personality,
      language,
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
    setStatus(error ? { ok: false, text: error.message } : { ok: true, text: "Saved" });
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.fg} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.back, { backgroundColor: colors.surface }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={colors.fg} />
        </Pressable>
        <AppText size={18} weight="700">
          Tutor settings
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identity}>
            <Pressable
              onPress={() => router.push("/inbox/ai-avatar")}
              accessibilityLabel="Change AI avatar"
            >
              <AiAvatar avatarKey={avatarKey} size={112} />
              <View style={[styles.editBadge, { backgroundColor: colors.inverseBg, borderColor: colors.bg }]}>
                <Ionicons name="pencil" size={14} color={colors.inverseFg} />
              </View>
            </Pressable>
            <AppText size={22} weight="700" style={{ marginTop: 14 }}>
              {name.trim() || "CampusOS Tutor"}
            </AppText>
            <AppText muted size={13} style={{ marginTop: 2 }}>
              {aiAvatarFor(avatarKey).name}
            </AppText>
            <Pressable
              onPress={() => router.push("/inbox/ai-avatar")}
              style={[styles.changeBtn, { backgroundColor: colors.accentSoft }]}
            >
              <Ionicons name="images-outline" size={16} color={colors.fg} />
              <AppText size={13} weight="600">
                Change avatar
              </AppText>
            </Pressable>
          </View>

          <Section title="Name">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="CampusOS Tutor"
              placeholderTextColor={colors.muted}
              maxLength={40}
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, borderWidth: 1.5, color: colors.fg }]}
            />
          </Section>

          <Section title="How it replies">
            <Label hint="Voice reads every reply aloud.">Reply mode</Label>
            <Segmented options={REPLY_MODES} value={replyMode} onChange={setReplyMode} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Label>Explanation style</Label>
            <Segmented options={STYLES} value={style} onChange={setStyle} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Label>Personality</Label>
            <Segmented options={PERSONALITIES} value={personality} onChange={setPersonality} />
          </Section>

          <Section title="Language">
            <Chips options={LANGUAGES} value={language} onChange={setLanguage} />
          </Section>

          <Section title="Voice speed">
            <Chips options={SPEEDS} value={speechRate} onChange={setSpeechRate} />
          </Section>

          <Section title="Context">
            <View style={styles.switchRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size={14} weight="600">
                  Use my study profile
                </AppText>
                <AppText muted size={12}>
                  Programme, level and courses.
                </AppText>
              </View>
              <Switch
                value={useCourse}
                onValueChange={setUseCourse}
                trackColor={{ true: colors.accent, false: colors.border }}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.switchRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size={14} weight="600">
                  Save chat history
                </AppText>
                <AppText muted size={12}>
                  Remembers earlier questions.
                </AppText>
              </View>
              <Switch
                value={saveHistory}
                onValueChange={setSaveHistory}
                trackColor={{ true: colors.accent, false: colors.border }}
              />
            </View>
          </Section>

          <Section title="Notes for your tutor">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={500}
              placeholder="e.g. I learn best with examples."
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  borderWidth: 1.5,
                  color: colors.fg,
                  minHeight: 110,
                  textAlignVertical: "top",
                  paddingTop: 12,
                },
              ]}
            />
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12) + 4,
          },
        ]}
      >
        {status ? (
          <AppText
            size={13}
            style={{ color: status.ok ? colors.success : colors.danger, marginBottom: 8, textAlign: "center" }}
          >
            {status.text}
          </AppText>
        ) : null}
        <Button title="Save changes" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.bg }]}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, on && { backgroundColor: colors.accent }]}
          >
            <AppText size={13} weight="600" style={{ color: on ? colors.onAccent : colors.fg }}>
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: Option<string>[];
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.chip,
              {
                backgroundColor: on ? colors.inverseBg : colors.bg,
                borderColor: on ? colors.inverseBg : colors.border,
              },
            ]}
          >
            <AppText size={13} weight="600" style={{ color: on ? colors.inverseFg : colors.fg }}>
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <AppText muted size={12} weight="600" style={{ marginLeft: 4 }}>
        {title.toUpperCase()}
      </AppText>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText weight="600" size={14}>
        {children}
      </AppText>
      {hint ? (
        <AppText muted size={12}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  identity: { alignItems: "center", paddingTop: 4 },
  editBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  changeBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  card: { borderRadius: radii.md, padding: 16, gap: 12 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  segmented: { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
