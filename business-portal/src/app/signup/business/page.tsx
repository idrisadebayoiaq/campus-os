import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SignupForm } from "@/components/auth-forms";

export const metadata = { title: "Sign up as business" };

export default function BusinessSignupPage() {
  return (
    <AuthFrame
      eyebrow="Business"
      title="Create your business account"
      description="Sign up, then apply from your dashboard as a housing provider or campus vendor."
      panelTitle="List once. Reach students on campus."
      panelBody="CampusOS reviews applications, then unlocks setup for housing, food, or marketplace listings."
    >
      <SignupForm intent="business" />
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
        <p>
          Need a lecturer account instead?{" "}
          <Link href="/signup/lecturer" className="font-medium text-fg underline underline-offset-2">
            Sign up as lecturer
          </Link>
        </p>
        <p>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-fg underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
