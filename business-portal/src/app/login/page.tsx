import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth-forms";
import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Business login" };

export default function LoginPage() {
  return (
    <Container>
      <div className="mx-auto max-w-md space-y-8 py-12">
        <PageHeader
          title="Log in to CampusOS Portal"
          description="Business access for providers, vendors, and applicants."
        />
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <LoginForm />
        </Suspense>
        <p className="text-sm text-muted">
          Need an account before applying?{" "}
          <Link href="/signup" className="text-fg underline underline-offset-2">
            Create one
          </Link>
        </p>
      </div>
    </Container>
  );
}
