import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SupportTeamManager } from "@/components/support-desk";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Support team" };
export const instant = false;

export default async function SupportTeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/support-team");

  const { data: team, error } = await supabase.rpc("admin_support_team");
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const signupUrl = host ? `${proto}://${host}/signup/support` : "/signup/support";

  return (
    <Container className="space-y-6 py-8 sm:py-12">
      <PageHeader
        title="Support team"
        description="People on the support team get their own Support desk in the Portal. Their job is answering support requests from students and businesses, including chats the assistant passes on."
      />
      {error || !isAdmin ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
          Only admins can manage the support team.
        </p>
      ) : (
        <SupportTeamManager
          team={(team ?? []) as Parameters<typeof SupportTeamManager>[0]["team"]}
          signupUrl={signupUrl}
        />
      )}
    </Container>
  );
}
