import { redirect } from "next/navigation";
import { BusinessInbox } from "@/components/business-inbox";
import { Container, PageHeader } from "@/components/ui";
import { displayNameFromProfile } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Inbox" };
export const instant = false;

export default async function BusinessInboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/inbox");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, first_name, preferred_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = displayNameFromProfile({
    preferred_name: profile?.preferred_name,
    first_name: profile?.first_name,
    full_name: profile?.full_name,
    email: user.email,
  });

  return (
    <Container className="space-y-6 py-8">
      <PageHeader
        title="Inbox"
        subtitle="Student messages for your listings and orders — WhatsApp-style"
      />
      <BusinessInbox userId={user.id} displayName={displayName} />
    </Container>
  );
}
