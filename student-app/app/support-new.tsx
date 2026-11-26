import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Button, Chip, Field, Input } from "@/src/components/ui";
import { supabase } from "@/src/lib/supabase";
import { STUDENT_TOPICS, openTicket } from "@/src/lib/support";
import { useTheme } from "@/src/theme/ThemeProvider";
import { radii } from "@/src/theme/tokens";

export default function NewTicketScreen() {
  const { category: initialCategory } = useLocalSearchParams<{ category?: string }>();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState(
    STUDENT_TOPICS.some((t) => t.category === initialCategory) ? initialCategory! : "",
  );
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!category) {
      setError("Choose what it's about.");
      return;
    }
    if (message.trim().length < 5) {
      setError("Tell us a bit more so the team can help.");
      return;
    }
    setBusy(true);
    try {
      const ticket = await openTicket(supabase, {
        subject: subject.trim() || message.trim().slice(0, 80),
        message: message.trim(),
        category,
      });
      router.replace({ pathname: "/inbox/[id]", params: { id: ticket.conversation_id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Could not send.");
    } finally {
      setBusy(false);
    }
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
          Chat with support
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 20,
            gap: 18,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
          }}
        >
          <View style={[styles.note, { backgroundColor: colors.surface }]}>
            <Ionicons name="time-outline" size={18} color={colors.accent} />
            <AppText size={13} muted style={{ flex: 1, lineHeight: 19 }}>
              A person on the CampusOS team replies in the ticket chat. You&apos;ll get a
              notification when they do.
            </AppText>
          </View>

          <Field label="What is it about?">
            <View style={styles.chips}>
              {STUDENT_TOPICS.map((t) => (
                <Chip
                  key={t.category}
                  label={t.title}
                  active={category === t.category}
                  onPress={() => setCategory(t.category)}
                />
              ))}
            </View>
          </Field>

          <Field label="Subject" hint="Optional. A short summary.">
            <Input
              value={subject}
              onChangeText={setSubject}
              maxLength={120}
              placeholder="e.g. Agent asked me to pay before inspection"
            />
          </Field>

          <Field label="Message">
            <Input
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={4000}
              placeholder="What happened? Include names, places and times that help us find it."
            />
          </Field>

          {error ? (
            <View style={[styles.banner, { borderColor: colors.danger, backgroundColor: colors.surface }]}>
              <AppText size={14} style={{ color: colors.danger }}>
                {error}
              </AppText>
            </View>
          ) : null}

          <Button title="Send to support" onPress={() => void submit()} loading={busy} />

          <Pressable onPress={() => router.replace("/support-assistant")} style={{ alignSelf: "center" }}>
            <AppText size={13} muted>
              Quick question?{" "}
              <AppText size={13} weight="700" style={{ color: colors.accent }}>
                Ask the assistant
              </AppText>
            </AppText>
          </Pressable>
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
  note: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderRadius: radii.md,
    padding: 14,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  banner: { borderRadius: radii.sm, borderWidth: 1, padding: 12 },
});
