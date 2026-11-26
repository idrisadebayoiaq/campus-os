import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { BUSINESS_TYPES } from "@/lib/business-types";

export const metadata = { title: "Create your account" };

const OPTIONS = [
  ...BUSINESS_TYPES.map((t) => ({
    href: `/signup/business?type=${t.key}`,
    title:
      t.key === "housing_provider"
        ? "Housing agent / landlord"
        : t.key === "food_vendor"
          ? "Restaurant / food vendor"
          : t.title,
    body: t.description,
  })),
  {
    href: "/signup/lecturer",
    title: "Lecturer",
    body: "Run classes and announcements for your students.",
  },
  {
    href: "/signup/school",
    title: "School authority",
    body: "Verify students, manage departments and approve lecturers for your school.",
  },
];

export default function SignupPage() {
  return (
    <AuthFrame
      eyebrow="Get started"
      title="What do you do on campus?"
      description="Pick one. You'll get only the tools for that, nothing else."
      panelTitle="The right tools, nothing extra"
      panelBody="Restaurants manage menus and orders. Housing agents manage rooms and inspections. Lecturers manage classes. Each account sees only what it needs."
      footer={
        <p>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-fg underline underline-offset-2">
            Log in
          </Link>
        </p>
      }
    >
      <div className="space-y-3">
        <Link
          href="/signup/staff"
          className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-sm transition hover:border-accent"
        >
          <span>
            <span className="block font-semibold text-fg">Skip, just create an account</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted">
              For admins, support staff and anyone not running a business, class or school.
            </span>
          </span>
          <span aria-hidden className="text-muted">
            →
          </span>
        </Link>
        {OPTIONS.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            className="block rounded-2xl border border-border bg-surface px-4 py-4 transition hover:border-accent"
          >
            <p className="text-sm font-semibold text-fg">{option.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{option.body}</p>
          </Link>
        ))}
        <p className="rounded-2xl bg-surface px-4 py-3 text-xs leading-5 text-muted">
          <span className="font-semibold text-fg">Are you a student?</span> Student accounts are
          created only in the CampusOS mobile app.{" "}
          <a
            href={`${process.env.NEXT_PUBLIC_STUDENT_WEB_URL || "https://campusos-app.vercel.app"}/download`}
            className="font-medium text-fg underline underline-offset-2"
          >
            Get the app
          </a>
        </p>
      </div>
    </AuthFrame>
  );
}
