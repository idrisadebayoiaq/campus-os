import { redirect } from "next/navigation";
import { ListingModeration } from "@/components/listing-moderation";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Listings moderation" };
export const instant = false;

export default async function AdminListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const isStaff = (roles ?? []).some((r) =>
    ["admin", "moderator"].includes(r.role),
  );
  if (!isStaff) {
    return (
      <Container>
        <div className="py-12">
          <EmptyState
            title="Staff only"
            description="CampusOS listing moderation is limited to admin and moderator roles."
          />
        </div>
      </Container>
    );
  }

  const { data: properties } = await supabase
    .from("properties")
    .select(
      "id, title, is_published, verification_label, campus_id, business_profiles(display_name), property_units(id, title, status, is_published)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Listings moderation"
          description="Hide, suspend, and adjust verification labels on CampusOS inventory."
        />
        {!properties?.length ? (
          <EmptyState
            title="No listings to moderate"
            description="Published housing inventory will appear here for review."
          />
        ) : (
          <ListingModeration properties={properties} />
        )}
      </div>
    </Container>
  );
}
