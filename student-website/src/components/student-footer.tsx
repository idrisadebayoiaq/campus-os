import Link from "next/link";
import { Container } from "@/components/ui";

export function StudentFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <Container>
        <div className="flex flex-col gap-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>CampusOS — student website. Your campus. Easier.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-fg">
              Terms
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
