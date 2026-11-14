import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SignupForm } from "@/components/auth-forms";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <AuthFrame
      eyebrow="Get started"
      title="Create your student account"
      description="Takes a minute. You can pick your school and finish setup anytime after."
      panelTitle="One account for campus life"
      panelBody="Save housing searches, track classes, message providers, and study with CampusOS AI."
    >
      <SignupForm />
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-fg underline underline-offset-2">
            Log in
          </Link>
        </p>
        <p className="text-xs">
          Are you a landlord or vendor? Apply through the business portal — this website is for students.
        </p>
      </div>
    </AuthFrame>
  );
}
