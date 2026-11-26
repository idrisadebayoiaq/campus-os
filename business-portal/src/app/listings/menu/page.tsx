import Link from "next/link";
import { redirect } from "next/navigation";
import { MenuManager, type MenuItem } from "@/components/menu-manager";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { canManage, myBusinesses } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Menu" };
export const instant = false;

export default async function MenuPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const kitchens = (await myBusinesses(supabase, user.id)).filter(
    (b) => b.business_type === "food_vendor" && canManage(b.role),
  );
  const ready = kitchens.filter((b) => b.setup_complete);
  if (!kitchens.length) {
    return (
      <Container>
        <div className="py-8 sm:py-12">
          <EmptyState title="No menu to manage" description="Only owners and managers of a food business can edit the menu." />
        </div>
      </Container>
    );
  }

  const { data: items } = ready.length
    ? await supabase
        .from("menu_items")
        .select(
          "id, name, price, category, in_stock, is_published, prep_minutes, menu_option_groups(id, menu_item_id, name, required, multi, menu_options(id, group_id, name, price_delta, in_stock))",
        )
        .in("business_id", ready.map((b) => b.id))
        .order("category")
        .order("name")
    : { data: [] };

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="Menu"
          description="Switch dishes in or out of stock, change prices, and add sizes or extras. Changes show in the student app straight away."
        />
        <div className="flex flex-wrap gap-3">
          {ready[0] ? <ButtonLink href={`/listings/food/new?business=${ready[0].id}`}>Add menu item</ButtonLink> : null}
          <ButtonLink href="/listings/deals" variant="secondary">
            Deals & specials
          </ButtonLink>
          <ButtonLink href="/listings/delivery" variant="secondary">
            Delivery
          </ButtonLink>
        </div>
        {!items?.length ? (
          <EmptyState title="No menu items" description="Add your first dish to start taking orders." />
        ) : (
          <MenuManager items={items as unknown as MenuItem[]} />
        )}
        <Link href="/listings" className="inline-block text-sm text-muted hover:text-fg">
          ← Back to listings
        </Link>
      </div>
    </Container>
  );
}
