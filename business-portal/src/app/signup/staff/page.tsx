import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SignupForm } from "@/components/auth-forms";

export const metadata = { title: "Create an account" };

export default function StaffSignupPage() {
  return (
    <AuthFrame
      eyebrow="No category"
      title="Create an account"
      description="For admins, support staff and anyone who does not run a business, class or school. Pick nothing now; your tools appear once an admin gives you access."
      panelTitle="Skip the categories"
      panelBody="If your email was invited to the support team, you land in the Support desk right away. Admins give other roles from the Admin area, and you can still apply as a business later."
    >
      <SignupForm intent="staff" redirectTo="/dashboard" />
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
        <p>
          Run a business, class or school?{" "}
          <Link href="/signup" className="font-medium text-fg underline underline-offset-2">
            Choose your account type
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
