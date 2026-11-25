import { CrudScreen } from "@/src/components/study";
import { CACHE_KEYS } from "@/src/lib/offline";
import type { LocalMeta } from "@/src/lib/study";

type PastQuestion = LocalMeta & {
  id: string;
  course_code: string;
  session_label?: string | null;
  title: string;
  content?: string | null;
};

export default function PastQuestionsScreen() {
  return (
    <CrudScreen<PastQuestion>
      title="Past questions"
      subtitle="Keep past question notes by course"
      table="past_question_docs"
      cacheKey={CACHE_KEYS.pastQuestions}
      fields={[
        { key: "course_code", label: "Course code", placeholder: "CSC 201", required: true },
        { key: "title", label: "Title", placeholder: "2024 exam paper", required: true },
        { key: "session_label", label: "Session", placeholder: "2023/2024" },
        { key: "content", label: "Questions / notes", type: "multiline" },
      ]}
      addLabel="Add past question"
      transformDraft={(d) => ({ ...d, course_code: String(d.course_code).toUpperCase() })}
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
