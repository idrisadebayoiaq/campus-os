import { redirect } from "next/navigation";
import { SchoolAnnouncementForm } from "@/components/school-announcement-form";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "School announcements" };
export const instant = false;

export default async function SchoolAnnouncementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/school/announcements");

  const { data: authority } = await supabase
    .from("school_authority_profiles")
    .select("institution_id, institutions(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!authority) redirect("/dashboard");

  const { data: rows } = await supabase
    .from("school_announcements")
    .select("id, title, body, audience, created_at")
    .eq("institution_id", authority.institution_id)
    .order("created_at", { ascending: false })
    .limit(50);

  const inst = Array.isArray(authority.institutions)
    ? authority.institutions[0]
    : authority.institutions;

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-10">
        <PageHeader
          title="School announcements"
          description={`Broadcast to ${(inst as { name?: string } | null)?.name || "your school"}.`}
        />
        <SchoolAnnouncementForm institutionId={authority.institution_id} />
        <ul className="space-y-3">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="rounded-xl border border-border px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted">{r.audience}</p>
              <p className="font-medium">{r.title}</p>
              <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{r.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
