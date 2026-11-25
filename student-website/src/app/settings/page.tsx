import Link from "next/link";
import { redirect } from "next/navigation";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

const LINKS = [
  { href: "/profile", title: "View profile", body: "Cover, intro, and shortcuts" },
  { href: "/profile/edit", title: "Edit profile", body: "Academics, housing, preferences" },
  { href: "/onboarding", title: "Campus", body: "Change school or campus" },
  { href: "/support", title: "Contact support", body: "Help with housing, study, or account" },
  { href: "/download", title: "Android app", body: "Download the CampusOS APK" },
] as const;

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  return (
    <Container>
      <div className="mx-auto max-w-xl space-y-8 py-10">
        <PageHeader
          title="Settings"
          description="Account, campus, and support shortcuts."
        />
        <ul className="divide-y divide-border rounded-xl border border-border">
          {LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex flex-col gap-0.5 px-4 py-3 transition hover:bg-surface sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="font-medium text-fg">{item.title}</span>
                <span className="text-sm text-muted sm:text-right">{item.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
