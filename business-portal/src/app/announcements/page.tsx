import Link from "next/link";
import { redirect } from "next/navigation";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Announcements" };
export const instant = false;

export default async function AnnouncementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/announcements");

  const { data: classes } = await supabase
    .from("class_offerings")
    .select("id, course_code, course_title")
    .eq("lecturer_user_id", user.id);

  const classIds = (classes ?? []).map((c) => c.id);
  const { data: announcements } = classIds.length
    ? await supabase
        .from("class_announcements")
        .select("id, title, body, created_at, class_id")
        .in("class_id", classIds)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] as { id: string; title: string; body: string; created_at: string; class_id: string }[] };

  const byClass = new Map((classes ?? []).map((c) => [c.id, c]));

  return (
    <Container>
      <div className="space-y-8 py-10">
        <PageHeader
          title="Announcements"
          description="Recent class announcements. Publish new ones from a class page."
        />
        {!announcements?.length ? (
          <EmptyState
            title="No announcements yet"
            description="Open a class and publish an announcement to notify enrolled students."
          />
        ) : (
          <ul className="space-y-3">
            {announcements.map((a) => {
              const cls = byClass.get(a.class_id);
              return (
                <li key={a.id} className="rounded-xl border border-border px-4 py-3">
                  <p className="text-xs text-muted">
                    <Link href={`/classes/${a.class_id}`} className="underline underline-offset-2">
                      {cls ? `${cls.course_code} · ${cls.course_title}` : "Class"}
                    </Link>
                  </p>
                  <p className="mt-1 font-medium">{a.title}</p>
                  <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{a.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Container>
  );
}
