import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { SignupForm } from "@/components/auth-forms";

export const metadata = { title: "Join the support team" };

export default function SupportSignupPage() {
  return (
    <AuthFrame
      eyebrow="Support team"
      title="Join the CampusOS support team"
      description="Use the email an admin invited. Your account opens straight into the Support desk."
      panelTitle="Invite only"
      panelBody="An admin adds your email to the support team first. If your email wasn't invited, the account won't get Support desk access."
    >
      <SignupForm intent="support" redirectTo="/support-desk" />
      <div className="mt-6 border-t border-border pt-5 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login?next=/support-desk" className="font-medium text-fg underline underline-offset-2">
          Log in
        </Link>
      </div>
    </AuthFrame>
  );
}
