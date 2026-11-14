import { StudySubnav } from "@/components/study/study-subnav";

export default function StudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="sticky top-[var(--topbar-h)] z-20 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 pt-2 sm:px-6">
          <StudySubnav />
        </div>
      </div>
      {children}
    </div>
  );
}
