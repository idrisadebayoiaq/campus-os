import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SignupForm } from "@/components/auth-forms";

export const metadata = { title: "Sign up as lecturer" };

export default function LecturerSignupPage() {
  return (
    <AuthFrame
      eyebrow="Lecturer"
      title="Create your lecturer account"
      description="Use your personal email to log in. After signup, submit a lecturer application with your school email for verification."
      panelTitle="School must already be on CampusOS"
      panelBody="CampusOS admin registers schools. School authority reviews lecturer applications before class tools unlock."
    >
      <SignupForm intent="lecturer" redirectTo="/apply/lecturer" />
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
        <p>
          Not a lecturer?{" "}
          <Link href="/signup" className="font-medium text-fg underline underline-offset-2">
            Choose another account type
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
