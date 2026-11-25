import Link from "next/link";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthFrame
      eyebrow="CampusOS"
      title="Sign in for live sessions"
      description="Use your CampusOS account to join class calls and meetings from the web."
      panelTitle="The student app lives on your phone"
      panelBody="Download CampusOS for Android or iOS. This sign-in is for joining live voice and video sessions in the browser."
    >
      <Suspense
        fallback={<p className="text-sm text-muted">Loading sign-in…</p>}
      >
        <LoginForm />
      </Suspense>
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
        <p>
          Need the app?{" "}
          <Link href="/#download" className="font-medium text-fg underline underline-offset-2">
            Download CampusOS
          </Link>
        </p>
        <p className="text-xs">
          Businesses and schools use the CampusOS Portal.
        </p>
      </div>
    </AuthFrame>
  );
}
