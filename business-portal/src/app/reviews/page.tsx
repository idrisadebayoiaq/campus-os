import Link from "next/link";
import { redirect } from "next/navigation";
import { LiveTables } from "@/components/live-tables";
import { ReportList, ReviewList, type ReportRow, type ReviewRow } from "@/components/reviews-panels";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { canManage, myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Reviews & reports" };
export const instant = false;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const businesses = await myBusinesses(supabase, user.id);
  if (!businesses.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No business" description="Reviews appear once you have an approved business." />
        </div>
      </Container>
    );
  }
  const ids = businesses.map((b) => b.id);
  const showReports = tab === "reports";

  const [{ data: rows }, reports] = await Promise.all([
    supabase
      .from("business_reviews")
      .select("id, business_id, student_id, rating, comment, business_reply, created_at")
      .in("business_id", ids)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(100),
    Promise.all(
      businesses
        .filter((b) => canManage(b.role))
        .map(async (b) => ((await supabase.rpc("business_reports", { p_business: b.id })).data ?? []) as ReportRow[]),
    ),
  ]);

  const studentIds = [...new Set((rows ?? []).map((r) => r.student_id))];
  const { data: names } = studentIds.length ? await supabase.rpc("student_first_names", { p_ids: studentIds }) : { data: [] };
  const reviews: ReviewRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    business_name: businesses.find((b) => b.id === r.business_id)?.display_name ?? "",
    rating: r.rating,
    comment: r.comment,
    business_reply: r.business_reply,
    created_at: r.created_at,
    student: ((names ?? []) as { id: string; first_name: string }[]).find((n) => n.id === r.student_id)?.first_name || "Student",
  }));
  const allReports = reports.flat();
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  const tabClass = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-medium ${on ? "bg-accent text-on-accent" : "border border-border"}`;

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Reviews & reports"
          description={avg ? `Average ${avg} from ${reviews.length} verified reviews.` : "Verified reviews from students who ordered, viewed or enquired."}
        />
        <div className="flex gap-2">
          <Link href="/reviews" className={tabClass(!showReports)}>
            Reviews ({reviews.length})
          </Link>
          <Link href="/reviews?tab=reports" className={tabClass(showReports)}>
            Reports ({allReports.length})
          </Link>
        </div>
        {showReports ? <ReportList reports={allReports} /> : <ReviewList reviews={reviews} />}
        <LiveTables tables={["business_reviews"]} channel="reviews-live" />
      </div>
    </Container>
  );
}
