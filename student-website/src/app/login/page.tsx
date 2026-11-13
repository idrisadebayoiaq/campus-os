import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth-forms";
import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <Container>
      <div className="mx-auto max-w-md space-y-8 py-12">
        <PageHeader
          title="Log in to CampusOS"
          description="Student access."
        />
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <LoginForm />
        </Suspense>
        <p className="text-sm text-muted">
          New here?{" "}
          <Link href="/signup" className="text-fg underline underline-offset-2">
            Create a student account
          </Link>
        </p>
      </div>
    </Container>
  );
}
