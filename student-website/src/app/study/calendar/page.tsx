import { CalendarPanel } from "@/components/study/calendar-panel";
import { Container, PageHeader } from "@/components/ui";
import { getStudentCampus } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Academic calendar" };
export const instant = false;

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const campus = user ? await getStudentCampus(supabase, user.id) : null;

  let events: { id: string; title: string; starts_at: string; ends_at: string | null; source: string }[] = [];

  if (user) {
    const personal = await supabase
      .from("academic_calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .order("starts_at");

    const community = campus
      ? await supabase
          .from("academic_calendar_events")
          .select("*")
          .eq("campus_id", campus.campusId)
          .order("starts_at")
      : { data: [] as typeof events };

    const merged = [...(personal.data ?? []), ...(community.data ?? [])];
    const seen = new Set<string>();
    events = merged.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader title="Calendar" description="Registration, breaks, and other key dates." />
        <CalendarPanel events={events} campusId={campus?.campusId} />
      </div>
    </Container>
  );
}
