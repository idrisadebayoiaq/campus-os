import { Suspense } from "react";
import { AiTutorPanel } from "@/components/study/ai-tutor-panel";
import { ButtonLink, Container, PageHeader } from "@/components/ui";

export const metadata = { title: "AI Tutor" };
export const instant = false;

export default function StudyAiPage() {
  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="AI Tutor"
          description="Tutor, practice, summarize."
        />
        <ButtonLink href="/study" variant="secondary">
          Study Hub
        </ButtonLink>
        <Suspense fallback={<p className="text-sm text-muted">Loading AI…</p>}>
          <AiTutorPanel />
        </Suspense>
      </div>
    </Container>
  );
}
