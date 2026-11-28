import { redirect } from "next/navigation";
import { EndRoleButton } from "@/components/end-role-button";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Student leaders" };
export const instant = false;

type LeaderRow = {
  kind: "office" | "class_rep";
  id: string;
  user_id: string;
  name: string;
  title: string;
  scope_label: string | null;
  status: string;
  term_ends_on: string | null;
  class_id: string | null;
  created_at: string;
};

export default async function SchoolLeadersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/school/leaders");

  const { data: authority } = await supabase
    .from("school_authority_profiles")
    .select("institution_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!authority) redirect("/dashboard");

  const { data, error } = await supabase.rpc("school_leaders", { p_institution: authority.institution_id });
  const rows = (data ?? []) as LeaderRow[];
  const offices = rows.filter((r) => r.kind === "office");
  const reps = rows.filter((r) => r.kind === "class_rep");

  const list = (items: LeaderRow[]) => (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {items.map((r) => (
        <li key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div className="space-y-0.5">
            <p className="font-medium">
              {r.name} · {r.title}
              {r.status === "invited" ? (
                <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">Invited</span>
              ) : null}
            </p>
            <p className="text-xs text-muted">
              {[r.scope_label, r.term_ends_on ? `term ends ${new Date(r.term_ends_on).toLocaleDateString()}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <EndRoleButton kind={r.kind} id={r.id} userId={r.user_id} classId={r.class_id} invited={r.status === "invited"} />
        </li>
      ))}
    </ul>
  );

  return (
    <Container>
      <div className="space-y-8 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <PageHeader
            title="Student leaders"
            description="Student union officers, faculty and department leaders, and class reps at your school."
          />
          <ButtonLink href="/school/students" variant="secondary">
            Appoint from students
          </ButtonLink>
        </div>

        {error ? <p className="text-sm text-danger">{error.message}</p> : null}

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Offices</h2>
          {offices.length ? (
            list(offices)
          ) : (
            <EmptyState
              title="No student leaders yet"
              description="Open Students, find the person and choose Appoint. They accept in the app."
            />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-medium">Class reps</h2>
          {reps.length ? (
            list(reps)
          ) : (
            <EmptyState title="No class reps yet" description="Lecturers pick class reps from each class roster." />
          )}
        </section>
      </div>
    </Container>
  );
}
