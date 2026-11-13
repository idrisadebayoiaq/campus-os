import { redirect } from "next/navigation";
import { InboxChat } from "@/components/inbox-chat";
import { Container, PageHeader } from "@/components/ui";
import { displayNameFromProfile } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Inbox" };
export const instant = false;

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/inbox");

  const [{ data: profile }, { data: inspections }, { data: enquiries }, { data: orders }, { data: notifications }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, first_name, preferred_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("inspection_requests")
        .select("id, status, created_at, property_units(title)")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("listing_enquiries")
        .select("id, subject, message, status, created_at")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("food_orders")
        .select("id, status, total, created_at, business_profiles(display_name)")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("notifications")
        .select("id, title, body, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const displayName = displayNameFromProfile({
    preferred_name: profile?.preferred_name,
    first_name: profile?.first_name,
    full_name: profile?.full_name,
    email: user.email,
  });

  const activity = [
    ...(inspections || []).map((item) => {
      const unit = Array.isArray(item.property_units) ? item.property_units[0] : item.property_units;
      return {
        id: `insp-${item.id}`,
        title: unit?.title || "Inspection request",
        preview: `Status: ${item.status}`,
        created_at: item.created_at,
        kind: "inspection" as const,
      };
    }),
    ...(enquiries || []).map((item) => ({
      id: `enq-${item.id}`,
      title: item.subject || "Listing enquiry",
      preview: item.message || item.status || "Enquiry update",
      created_at: item.created_at,
      kind: "enquiry" as const,
    })),
    ...(orders || []).map((item) => {
      const biz = Array.isArray(item.business_profiles)
        ? item.business_profiles[0]
        : item.business_profiles;
      return {
        id: `ord-${item.id}`,
        title: biz?.display_name || "Food order",
        preview: `${item.status} · ₦${Number(item.total).toLocaleString()}`,
        created_at: item.created_at,
        kind: "order" as const,
      };
    }),
    ...(notifications || []).map((item) => ({
      id: `ntf-${item.id}`,
      title: item.title,
      preview: item.body || "CampusOS notification",
      created_at: item.created_at,
      kind: "notification" as const,
    })),
  ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <Container className="max-w-6xl">
      <div className="space-y-6 py-6 sm:py-8">
        <PageHeader
          title="Inbox"
          description="Chats and updates."
        />
        <InboxChat userId={user.id} displayName={displayName} activity={activity} />
      </div>
    </Container>
  );
}
