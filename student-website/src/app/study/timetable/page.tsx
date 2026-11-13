import { TimetableForm } from "@/components/study/timetable-form";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { DAYS, type TimetableRow } from "@/lib/study/utils";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Timetable" };
export const instant = false;

export default async function TimetablePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rows } = user
    ? await supabase
        .from("timetable_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("day_of_week")
        .order("start_time")
    : { data: [] };

  const { data: courses } = user
    ? await supabase.from("student_courses").select("id, code, title").eq("user_id", user.id)
    : { data: [] };

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Timetable" description="Weekly lectures." />
        <ButtonLink href="/study" variant="secondary">
          Study Hub
        </ButtonLink>

        <div className="divide-y divide-border rounded-md border border-border">
          {(rows as TimetableRow[])?.length ? (
            (rows as TimetableRow[]).map((row) => (
              <div key={row.id} className="px-4 py-3 text-sm">
                <p className="font-medium">
                  {DAYS[row.day_of_week]} · {row.course_code}
                  {row.course_title ? ` — ${row.course_title}` : ""}
                </p>
                <p className="text-muted">
                  {row.start_time}–{row.end_time}
                  {row.venue ? ` · ${row.venue}` : ""}
                  {row.lecturer ? ` · ${row.lecturer}` : ""}
                </p>
              </div>
            ))
          ) : (
            <p className="px-4 py-6 text-sm text-muted">No classes yet.</p>
          )}
        </div>

        <TimetableForm rows={(rows as TimetableRow[]) ?? []} courses={courses ?? []} />
      </div>
    </Container>
  );
}
