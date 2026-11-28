import Link from "next/link";
import { redirect } from "next/navigation";
import { AppointOfficeButton } from "@/components/appoint-office-button";
import { Button, Container, EmptyState, Input, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Students" };
export const instant = false;

const PAGE_SIZE = 50;
const LEVELS = ["100", "200", "300", "400", "500", "600"];
const selectClass = "h-11 rounded-2xl border border-border bg-bg px-3 text-sm";

type StudentRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  matric_number: string | null;
  department: string | null;
  faculty: string | null;
  level: string | null;
  verification_status: string;
  joined_at: string;
  roles: string[] | null;
  total: number;
};

export default async function SchoolStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/school/students");

  const { data: authority } = await supabase
    .from("school_authority_profiles")
    .select("institution_id, institutions(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!authority) redirect("/dashboard");

  const institutionId = authority.institution_id as string;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim() || "";
  const dept = sp.dept || "";
  const level = sp.level || "";
  const verified = sp.verified || "";

  const [{ data: rows, error }, { data: departments }, { data: faculties }] = await Promise.all([
    supabase.rpc("school_students", {
      p_institution: institutionId,
      p_search: q || null,
      p_department: dept || null,
      p_level: level || null,
      p_verified: verified || null,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.from("departments").select("id, name").eq("institution_id", institutionId).order("name"),
    supabase.from("faculties").select("id, name").eq("institution_id", institutionId).order("name"),
  ]);

  const students = (rows ?? []) as StudentRow[];
  const total = Number(students[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inst = Array.isArray(authority.institutions) ? authority.institutions[0] : authority.institutions;
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (dept) params.set("dept", dept);
    if (level) params.set("level", level);
    if (verified) params.set("verified", verified);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/school/students${s ? `?${s}` : ""}`;
  };

  return (
    <Container>
      <div className="space-y-6 py-10">
        <PageHeader
          title="Students"
          description={`Everyone who signed up with ${(inst as { name?: string } | null)?.name || "your school"}. Appoint student leaders from here.`}
        />

        <form className="flex flex-wrap items-end gap-2" action="/school/students">
          <Input name="q" defaultValue={q} placeholder="Name, email or matric number" className="min-w-[220px] flex-1" />
          <select name="dept" defaultValue={dept} className={selectClass}>
            <option value="">All departments</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select name="level" defaultValue={level} className={selectClass}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l} level
              </option>
            ))}
          </select>
          <select name="verified" defaultValue={verified} className={selectClass}>
            <option value="">Any ID status</option>
            <option value="verified">Verified</option>
            <option value="unverified">Not verified</option>
          </select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>

        {error ? <p className="text-sm text-danger">{error.message}</p> : null}

        <p className="text-sm text-muted">
          {total} student{total === 1 ? "" : "s"}
          {pages > 1 ? ` · page ${page} of ${pages}` : ""}
        </p>

        {students.length === 0 ? (
          <EmptyState title="No students found" description="Students appear here as soon as they pick your school in the app." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {students.map((s) => (
              <li key={s.user_id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">
                    {s.full_name}
                    {s.verification_status === "verified" ? (
                      <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                        Verified
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {[
                      s.department,
                      s.level ? `${s.level} level` : null,
                      s.matric_number,
                      s.email,
                      `joined ${new Date(s.joined_at).toLocaleDateString()}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {s.roles?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {s.roles.map((r) => (
                        <span key={r} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold">
                          {r}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <AppointOfficeButton
                  institutionId={institutionId}
                  userId={s.user_id}
                  name={s.full_name}
                  faculties={faculties ?? []}
                  departments={departments ?? []}
                />
              </li>
            ))}
          </ul>
        )}

        {pages > 1 ? (
          <div className="flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={link(page - 1)} className="underline underline-offset-2">
                Previous
              </Link>
            ) : (
              <span />
            )}
            {page < pages ? (
              <Link href={link(page + 1)} className="underline underline-offset-2">
                Next
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </Container>
  );
}
