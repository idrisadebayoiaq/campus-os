import { redirect } from "next/navigation";
import { DealsManager, type Deal } from "@/components/deals-manager";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { canManage, myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Deals" };
export const instant = false;

export default async function DealsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const kitchens = (await myBusinesses(supabase, user.id)).filter(
    (b) => b.business_type === "food_vendor" && b.setup_complete && canManage(b.role),
  );
  if (!kitchens.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No food business" description="Only owners and managers of a set-up food business can run deals." />
        </div>
      </Container>
    );
  }
  const ids = kitchens.map((k) => k.id);

  const [{ data: deals }, { data: menu }] = await Promise.all([
    supabase.from("promotions").select("*").in("business_id", ids).order("created_at", { ascending: false }),
    supabase.from("menu_items").select("id, name, price, business_id").in("business_id", ids).eq("is_published", true).order("name"),
  ]);

  return (
    <Container>
      <div className="space-y-10 py-8 sm:py-12">
        <PageHeader
          title="Deals & specials"
          description="Pin a discounted dish for today, or give students a code to use at checkout."
        />
        {kitchens.map((k) => (
          <section key={k.id} className="space-y-3">
            {kitchens.length > 1 ? <h2 className="text-lg font-medium">{k.display_name}</h2> : null}
            <DealsManager
              businessId={k.id}
              menu={(menu ?? []).filter((m) => m.business_id === k.id)}
              deals={(deals ?? []).filter((d) => d.business_id === k.id) as Deal[]}
            />
          </section>
        ))}
      </div>
    </Container>
  );
}
