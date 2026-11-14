import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { NavIcon } from "@/components/nav-icons";
import { Container } from "@/components/ui";
import { getStudentCampus } from "@/lib/campus";
import { SETUP_CARDS } from "@/lib/onboarding";
import { calcCgpa } from "@/lib/study/ai";
import { DAYS, getNextClass, type TimetableRow } from "@/lib/study/utils";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Home" };
export const instant = false;

type Shortcut = {
  href: string;
  title: string;
  icon: string;
};

const STUDY_SHORTCUTS: Shortcut[] = [
  { href: "/study/courses", title: "Courses", icon: "courses" },
  { href: "/study/timetable", title: "Timetable", icon: "timetable" },
  { href: "/study/assignments", title: "Assignments", icon: "assignments" },
  { href: "/study/exams", title: "Exams", icon: "exams" },
];

const HOUSING_SHORTCUTS: Shortcut[] = [
  { href: "/housing", title: "Hostel", icon: "housing" },
  { href: "/profile?setup=housing", title: "Budget", icon: "budget" },
];

const HOUSING_REPLACEMENTS: Shortcut[] = [
  { href: "/food", title: "Food", icon: "food" },
  { href: "/marketplace", title: "Market", icon: "market" },
];

const AI_SHORTCUT: Shortcut = { href: "/study/ai", title: "AI Study", icon: "ai" };

const SOCIAL_SHORTCUTS: Shortcut[] = [
  { href: "/study/groups", title: "Groups", icon: "groups" },
  { href: "/inbox", title: "Inbox", icon: "inbox" },
];

function ShortcutCard({ item }: { item: Shortcut }) {
  return (
    <Link
      href={item.href}
      className="flex flex-col items-center gap-2 rounded-md border border-border bg-bg px-2 py-3 text-center transition hover:bg-surface"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface text-fg ring-1 ring-border">
        <NavIcon name={item.icon} className="h-4 w-4" />
      </span>
      <span className="text-xs font-medium leading-tight">{item.title}</span>
    </Link>
  );
}

export default async function StudentDashboardPage() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: student },
    { data: profile },
    { data: housing },
    { data: grades },
    { data: timetable },
    { data: progress },
    { count: courseCount },
  ] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("student_status, academic_level, department_name, target_cgpa")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("full_name, first_name, preferred_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("housing_preferences")
      .select("housing_status, max_budget")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("grade_entries")
      .select("credit_units, grade, grade_point")
      .eq("user_id", user.id),
    supabase.from("timetable_entries").select("*").eq("user_id", user.id),
    supabase
      .from("onboarding_progress")
      .select("is_complete")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("student_courses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const campus = await getStudentCampus(supabase, user.id);

  const displayName =
    profile?.preferred_name ||
    profile?.first_name ||
    profile?.full_name ||
    user.email?.split("@")[0] ||
    "Student";

  const { cgpa } = calcCgpa(grades || []);
  const next = getNextClass((timetable || []) as TimetableRow[]);
  const hasHostel = housing?.housing_status === "housed";
  const midShortcuts = hasHostel ? HOUSING_REPLACEMENTS : HOUSING_SHORTCUTS;

  const nextLabel = next
    ? `${next.row.course_code}${next.row.course_title ? ` · ${next.row.course_title}` : ""}`
    : null;
  const nextWhen = next
    ? `${next.dayOffset === 0 ? "Today" : next.dayOffset === 1 ? "Tomorrow" : DAYS[next.row.day_of_week]} · ${next.row.start_time}`
    : null;

  const shortcuts = [...STUDY_SHORTCUTS, ...midShortcuts, AI_SHORTCUT, ...SOCIAL_SHORTCUTS];
  const showSetupList = !progress?.is_complete || (courseCount ?? 0) === 0;

  return (
    <Container>
      <div className="space-y-6 py-6 sm:py-8">
        <div>
          <p className="text-sm text-muted">Home</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hi {displayName}</h1>
          <p className="mt-1 text-sm text-muted">
            {campus
              ? `${campus.institutionName} · ${campus.campusName}`
              : student?.academic_level
                ? `${student.academic_level}${student.department_name ? ` · ${student.department_name}` : ""}`
                : "CampusOS"}
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/study/cgpa"
            className="rounded-md border border-border bg-surface px-4 py-3 hover:bg-bg"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">CGPA</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {cgpa != null ? cgpa.toFixed(2) : "—"}
            </p>
            {student?.target_cgpa ? (
              <p className="mt-0.5 text-xs text-muted">Target {Number(student.target_cgpa).toFixed(2)}</p>
            ) : null}
          </Link>

          <Link
            href="/study/timetable"
            className="rounded-md border border-border bg-surface px-4 py-3 hover:bg-bg"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Next class</p>
            {nextLabel ? (
              <>
                <p className="mt-1 truncate text-base font-semibold tracking-tight">{nextLabel}</p>
                <p className="mt-0.5 text-xs text-muted">{nextWhen}</p>
              </>
            ) : (
              <p className="mt-1 text-base font-semibold tracking-tight">None yet</p>
            )}
          </Link>
        </section>

        {!progress?.is_complete || !campus ? (
          <section className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border px-3 py-2 text-xs text-muted">
            <span>Optional setup</span>
            <Link href="/onboarding" className="underline underline-offset-2">
              Continue
            </Link>
            <Link href="/profile" className="underline underline-offset-2">
              Settings
            </Link>
          </section>
        ) : null}

        {showSetupList ? (
          <section className="space-y-3 border-t border-border pt-6">
            <h2 className="text-sm font-medium">Finish setup</h2>
            <ul className="divide-y divide-border border-y border-border text-sm">
              {SETUP_CARDS.map((card) => (
                <li key={card.id}>
                  <Link
                    href={card.href}
                    className="flex flex-col gap-0.5 py-3 transition hover:bg-surface sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                  >
                    <span className="font-medium text-fg">{card.title}</span>
                    <span className="text-muted sm:max-w-md sm:text-right">{card.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Shortcuts</h2>
            {!hasHostel ? (
              <Link href="/profile#housing" className="text-xs text-muted underline underline-offset-2">
                I have hostel
              </Link>
            ) : (
              <Link href="/housing" className="text-xs text-muted underline underline-offset-2">
                Housing
              </Link>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-9">
            {shortcuts.map((item) => (
              <ShortcutCard key={item.href} item={item} />
            ))}
          </div>
        </section>
      </div>
    </Container>
  );
}
