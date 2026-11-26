import { redirect } from "next/navigation";
import { DisputeQueue, type DisputeRow } from "@/components/market-orders";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Disputes" };
export const instant = false;

export default async function AdminDisputesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="Staff only" description="Marketplace disputes are decided by CampusOS staff." />
        </div>
      </Container>
    );
  }

  const { data: rows } = await supabase
    .from("market_orders")
    .select("id, title, amount, status, buyer_id, seller_user_id, seller_business_id, dispute_reason, dispute_opened_by, dispute_opened_at, buyer_photo, seller_photo, cancel_note, ruling, ruling_note, business_profiles(display_name)")
    .in("status", ["disputed", "resolved"])
    .order("dispute_opened_at", { ascending: false })
    .limit(60);

  const userIds = [...new Set((rows ?? []).flatMap((r) => [r.buyer_id, r.seller_user_id].filter(Boolean) as string[]))];
  const { data: names } = userIds.length ? await supabase.rpc("student_first_names", { p_ids: userIds }) : { data: [] };
  const nameOf = (id: string | null) => ((names ?? []) as { id: string; first_name: string }[]).find((n) => n.id === id)?.first_name || "Student";

  const paths = (rows ?? []).flatMap((r) => [r.buyer_photo, r.seller_photo].filter(Boolean) as string[]);
  const urls: Record<string, string> = {};
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("market-evidence").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
  }

  const disputes: DisputeRow[] = (rows ?? []).map((r) => {
    const biz = Array.isArray(r.business_profiles) ? r.business_profiles[0] : r.business_profiles;
    return {
      id: r.id,
      title: r.title,
      amount: Number(r.amount),
      buyer: nameOf(r.buyer_id),
      seller: biz?.display_name ?? nameOf(r.seller_user_id),
      reason: r.dispute_reason,
      opened_by: r.dispute_opened_by === r.buyer_id ? "buyer" : "seller",
      buyer_photo: r.buyer_photo,
      seller_photo: r.seller_photo,
      cancel_note: r.cancel_note,
      opened_at: r.dispute_opened_at,
      status: r.status,
      ruling: r.ruling,
      ruling_note: r.ruling_note,
    };
  });

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Marketplace disputes"
          description="Look at both sides and the photos, then pay the seller, refund the buyer or split. Commission is only taken on the part that goes to the seller."
        />
        <DisputeQueue rows={disputes} urls={urls} />
      </div>
    </Container>
  );
}
