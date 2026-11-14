import Link from "next/link";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthFrame
      eyebrow="Student access"
      title="Welcome back"
      description="Log in to continue to housing, study tools, and your campus inbox."
    >
      <Suspense
        fallback={<p className="text-sm text-muted">Loading sign-in…</p>}
      >
        <LoginForm />
      </Suspense>
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
        <p>
          New here?{" "}
          <Link href="/signup" className="font-medium text-fg underline underline-offset-2">
            Create a student account
          </Link>
        </p>
        <p className="text-xs">
          Landlord or vendor? Use the CampusOS business portal — this site is for students.
        </p>
      </div>
    </AuthFrame>
  );
}
