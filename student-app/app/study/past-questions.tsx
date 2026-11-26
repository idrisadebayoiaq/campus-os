import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { PremiumGate } from "@/src/components/premium-gate";
import { CrudScreen, StudyShell } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import { usePremium } from "@/src/lib/premium-state";
import { useStudentKind } from "@/src/lib/student-kind";
import type { LocalMeta } from "@/src/lib/study";
import { useTheme } from "@/src/theme/ThemeProvider";

type PastQuestion = LocalMeta & {
  id: string;
  course_code: string;
  session_label?: string | null;
  title: string;
  content?: string | null;
};

export default function PastQuestionsScreen() {
  const { isExamPrep, loading: kindLoading } = useStudentKind();
  const premium = usePremium();
  const colors = useTheme();

  // Past questions are only for exam candidates; students in school don't see them.
  if (!kindLoading && !isExamPrep) return <Redirect href="/(tabs)" />;

  if (isExamPrep && premium.loading) {
    return (
      <StudyShell title="Past questions" subtitle="One moment…">
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <ActivityIndicator color={colors.fg} />
        </View>
      </StudyShell>
    );
  }
  if (isExamPrep && !premium.active) {
    return (
      <PremiumGate
        title="Past questions"
        subtitle="Practise the way the exam asks"
        feature="Past questions"
        price={premium.price}
        points={[
          "Practise with JAMB, WAEC and NECO past questions",
          "Save your own questions and notes, even offline",
          "Plus the AI tutor to explain every answer",
        ]}
      />
    );
  }

  return (
    <CrudScreen<PastQuestion>
      title="Past questions"
      subtitle={isExamPrep ? "Your exam past questions and notes" : "Keep past question notes by course"}
      table="past_question_docs"
      cacheKey={CACHE_KEYS.pastQuestions}
      fields={[
        {
          key: "course_code",
          label: isExamPrep ? "Subject" : "Course code",
          placeholder: isExamPrep ? "Mathematics" : "CSC 201",
          required: true,
        },
        { key: "title", label: "Title", placeholder: isExamPrep ? "JAMB 2024 paper" : "2024 exam paper", required: true },
        { key: "session_label", label: "Session", placeholder: isExamPrep ? "2024" : "2023/2024" },
        { key: "content", label: "Questions / notes", type: "multiline" },
      ]}
      addLabel="Add past question"
      transformDraft={(d) => ({ ...d, course_code: isExamPrep ? String(d.course_code) : String(d.course_code).toUpperCase() })}
      emptyTitle="No past questions saved"
      emptyBody="Type or paste questions so you can revise them offline."
      renderItem={(p) => ({
        title: `${p.course_code} · ${p.title}`,
        subtitle: p.content ? (p.content.length > 140 ? `${p.content.slice(0, 140)}…` : p.content) : undefined,
        meta: p.session_label ?? undefined,
      })}
    />
  );
}
