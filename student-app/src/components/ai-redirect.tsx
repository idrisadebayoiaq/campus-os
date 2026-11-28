import { Redirect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { AppText, Button } from "@/src/components/ui";
import { PremiumGate } from "@/src/components/premium-gate";
import { StudyShell } from "@/src/components/study";
import { useAuth } from "@/src/lib/auth";
import { ensureAiConversation, rememberedAiChat, storedAiChat } from "@/src/lib/messaging";
import { usePremium } from "@/src/lib/premium-state";
import { useStudentKind } from "@/src/lib/student-kind";
import { useStudyLock } from "@/src/lib/study-lock";
import { supabase } from "@/src/lib/supabase";
import { useTheme } from "@/src/theme/ThemeProvider";

type RedirectProps = { title?: string; subtitle?: string };

/**
 * Opens the AI tutor chat. Students in school use it free (with limits);
 * exam candidates need Premium, so they see an unlock card first.
 */
export function AiConversationRedirect(props: RedirectProps) {
  const { isExamPrep } = useStudentKind();
  const premium = usePremium();
  const colors = useTheme();
  if (isExamPrep && premium.loading) {
    return (
      <StudyShell title={props.title ?? "AI Tutor"} subtitle="One moment…">
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={colors.fg} />
        </View>
      </StudyShell>
    );
  }
  if (isExamPrep && !premium.active) {
    return (
      <PremiumGate
        title="AI Tutor"
        subtitle="Your personal exam coach"
        feature="The AI tutor"
        price={premium.price}
        points={[
          "Step-by-step answers for JAMB, WAEC and NECO subjects",
          "Exam-style practice questions with explanations",
          "Ask as many questions as you need, every day",
        ]}
      />
    );
  }
  return <TutorOpener {...props} />;
}

/** Opens the AI companion chat, with recoverable errors. */
function TutorOpener({
  title = "AI Tutor",
  subtitle = "Opening your study chat…",
}: RedirectProps) {
  const { user } = useAuth();
  const { allowPath } = useStudyLock();
  const colors = useTheme();
  const [href, setHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const go = useCallback(
    (conversationId: string) => {
      allowPath(`/inbox/${conversationId}`);
      setHref(`/inbox/${conversationId}?kind=ai`);
    },
    [allowPath],
  );

  useLayoutEffect(() => {
    const known = user ? rememberedAiChat(user.id) : null;
    if (known) go(known);
  }, [user, go]);

  const open = useCallback(async () => {
    if (!user) {
      setError("Sign in to use the AI tutor.");
      return;
    }
    if (rememberedAiChat(user.id)) return;
    setError(null);
    const saved = await storedAiChat(user.id);
    if (saved) {
      go(saved);
      return;
    }
    try {
      const { conversationId } = await ensureAiConversation(supabase, user.id);
      go(conversationId);
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : e instanceof Error
            ? e.message
            : "Could not open AI tutor.";
      setError(message);
    }
  }, [user, go]);

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
          <Button title="Retry" onPress={() => setAttempt((n) => n + 1)} />
        </View>
      </StudyShell>
    );
  }

  return (
    <StudyShell title={title} subtitle={subtitle}>
      <View style={{ paddingVertical: 48, alignItems: "center" }}>
        <ActivityIndicator color={colors.fg} />
      </View>
    </StudyShell>
  );
}
