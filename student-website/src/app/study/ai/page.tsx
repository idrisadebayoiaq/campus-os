import { Suspense } from "react";
import { AiTutorPanel } from "@/components/study/ai-tutor-panel";
import { Container } from "@/components/ui";

export const metadata = { title: "AI Tutor" };
export const instant = false;

export default function StudyAiPage() {
  return (
    <Container>
      <div className="space-y-4 py-6 sm:py-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            AI Tutor
          </h1>
          <p className="text-sm text-muted">
            Chat like a study partner — explain, practice, summarize notes.
          </p>
        </div>
        <Suspense
          fallback={
            <div className="flex min-h-[24rem] items-center justify-center rounded-xl border border-border text-sm text-muted">
              Loading chat…
            </div>
          }
        >
          <AiTutorPanel />
        </Suspense>
      </div>
    </Container>
  );
}
