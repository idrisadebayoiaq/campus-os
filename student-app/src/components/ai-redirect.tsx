import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AppText, Button } from "@/src/components/ui";
import { StudyShell } from "@/src/components/study";
import { useAuth } from "@/src/lib/auth";
import { ensureAiConversation } from "@/src/lib/messaging";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

/** Opens the WhatsApp-style AI companion chat, with recoverable errors. */
export function AiConversationRedirect({
  title = "AI Tutor",
  subtitle = "Opening your study chat…",
}: {
  title?: string;
  subtitle?: string;
}) {
  const { user } = useAuth();
  const colors = useTheme();
  const [href, setHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const open = useCallback(async () => {
    if (!user) {
      setError("Sign in to use the AI tutor.");
      return;
    }
    setError(null);
    setHref(null);
    try {
      const { conversationId } = await ensureAiConversation(supabase, user.id);
      setHref(`/inbox/${conversationId}`);
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : e instanceof Error
            ? e.message
            : "Could not open AI tutor.";
      setError(message);
    }
  }, [user]);

  useEffect(() => {
    void open();
  }, [open, attempt]);

  if (href) {
    return <Redirect href={href as `/inbox/${string}`} />;
  }

  if (error) {
    return (
      <StudyShell title={title} subtitle="Couldn’t open chat">
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 20,
            gap: 12,
          }}
        >
          <AppText size={15}>{error}</AppText>
          <AppText muted size={13}>
            Check your connection and try again. Your tutor chat will open here
            once it’s ready.
          </AppText>
          <Button title="Retry" onPress={() => setAttempt((n) => n + 1)} />
        </View>
      </StudyShell>
    );
  }

  return (
    <StudyShell title={title} subtitle={subtitle}>
      <View style={{ paddingVertical: 48, alignItems: "center", gap: 12 }}>
        <ActivityIndicator color={colors.fg} />
        <AppText muted size={13}>
          Preparing your tutor…
        </AppText>
      </View>
    </StudyShell>
  );
}
