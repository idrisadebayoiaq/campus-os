import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { SignupForm } from "@/components/auth-forms";
import { businessTypeLabel, isBusinessType } from "@/lib/business-types";

export const metadata = { title: "Sign up as business" };
export const instant = false;

export default async function BusinessSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  if (!type || !isBusinessType(type)) redirect("/signup");

  const label = businessTypeLabel(type);

  return (
    <AuthFrame
      eyebrow={label}
      title={`Create your ${label.toLowerCase()} account`}
      description="After signing up you'll go straight to your application. Once approved you only see tools for your business."
      panelTitle="List once. Reach students on campus."
      panelBody="CampusOS reviews applications, then unlocks setup and listings for your kind of business."
    >
      <SignupForm intent="business" redirectTo={`/apply/${type}`} />
      <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm text-muted">
        <p>
          Not a {label.toLowerCase()}?{" "}
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
