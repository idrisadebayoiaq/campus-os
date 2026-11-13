import Link from "next/link";
import { SignupForm } from "@/components/auth-forms";
import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Create business account" };

export default function SignupPage() {
  return (
    <Container>
      <div className="mx-auto max-w-md space-y-8 py-12">
        <PageHeader
          title="Create account"
          description="Sign up, then open your CampusOS portal dashboard to apply as a business."
        />
        <SignupForm />
        <p className="text-sm text-muted">
          Already registered?{" "}
          <Link href="/login" className="text-fg underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    </Container>
  );
}
