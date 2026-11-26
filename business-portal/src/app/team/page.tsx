import { redirect } from "next/navigation";
import { TeamManager, type TeamMember } from "@/components/team-manager";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Team" };
export const instant = false;

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const owned = (await myBusinesses(supabase, user.id)).filter((b) => b.role === "owner");
  if (!owned.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="Owner only" description="Only the business owner can manage the team." />
        </div>
      </Container>
    );
  }

  const teams = await Promise.all(
    owned.map(async (b) => {
      const { data } = await supabase.rpc("business_team", { p_business: b.id });
      return { business: b, members: (data ?? []) as TeamMember[] };
    }),
  );

  return (
    <Container>
      <div className="space-y-10 py-8 sm:py-12">
        <PageHeader
          title="Team"
          description="Let your cashier, kitchen staff or agent handle day-to-day work without sharing your login."
        />
        {teams.map(({ business, members }) => (
          <section key={business.id} className="space-y-3">
            {teams.length > 1 ? <h2 className="text-lg font-medium">{business.display_name}</h2> : null}
            <TeamManager businessId={business.id} members={members} />
          </section>
        ))}
      </div>
    </Container>
  );
}
