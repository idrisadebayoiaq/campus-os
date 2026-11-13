import Link from "next/link";
import { SignupForm } from "@/components/auth-forms";
import { Container, PageHeader } from "@/components/ui";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <Container>
      <div className="mx-auto max-w-md space-y-8 py-12">
        <PageHeader
          title="Create student account"
          description="Create your student account."
        />
        <SignupForm />
        <p className="text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-fg underline underline-offset-2">
            Log in
          </Link>
        </p>
        <p className="text-sm text-muted">
          Are you a landlord or vendor? Use the business portal to apply — this
          website is for students.
        </p>
      </div>
    </Container>
  );
}
