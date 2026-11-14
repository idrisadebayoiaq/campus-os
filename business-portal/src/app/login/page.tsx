import Link from "next/link";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Business login" };

export default function LoginPage() {
  return (
    <AuthFrame
      eyebrow="Business portal"
      title="Welcome back"
      description="Log in to manage applications, listings, orders, and campus services."
    >
      <Suspense fallback={<p className="text-sm text-muted">Loading sign-in…</p>}>
        <LoginForm />
      </Suspense>
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
        <p>
          Need an account before applying?{" "}
          <Link href="/signup" className="font-medium text-fg underline underline-offset-2">
            Create one
          </Link>
        </p>
        <p className="text-xs">
          Looking for housing or study tools? Use the CampusOS student website instead.
        </p>
      </div>
    </AuthFrame>
  );
}
