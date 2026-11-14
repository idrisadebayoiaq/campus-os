import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SignupForm } from "@/components/auth-forms";

export const metadata = { title: "Create business account" };

export default function SignupPage() {
  return (
    <AuthFrame
      eyebrow="Get started"
      title="Create your portal account"
      description="Sign up, then open your dashboard to apply as a housing provider or campus vendor."
      panelTitle="List once. Reach students on campus."
      panelBody="CampusOS reviews applications, then unlocks setup for housing, food, or marketplace listings."
    >
      <SignupForm />
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
        <p>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-fg underline underline-offset-2">
            Log in
          </Link>
        </p>
        <p className="text-xs">
          After signup, go to Apply from your dashboard to submit a business application.
        </p>
      </div>
    </AuthFrame>
  );
}
