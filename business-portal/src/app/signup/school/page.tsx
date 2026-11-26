import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SignupForm } from "@/components/auth-forms";

export const metadata = { title: "Sign up as school authority" };

export default function SchoolSignupPage() {
  return (
    <AuthFrame
      eyebrow="School authority"
      title="Create your school account"
      description="Use your official school email. CampusOS admin links your account to your school, then your school tools unlock."
      panelTitle="Manage your school on CampusOS"
      panelBody="Verify students, manage departments, approve lecturers and send school announcements — only the tools a school needs."
    >
      <SignupForm intent="school" redirectTo="/dashboard" />
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
        <p>
          Not a school authority?{" "}
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
