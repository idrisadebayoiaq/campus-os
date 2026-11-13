import Link from "next/link";
import { redirect } from "next/navigation";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Listings" };
export const instant = false;

export default async function ListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/listings");

  const { data: businesses } = await supabase
    .from("business_profiles")
    .select("id, display_name, business_type, setup_complete, slug")
    .eq("owner_user_id", user.id);

  const housing = (businesses ?? []).filter((b) => b.business_type === "housing_provider");
  const food = (businesses ?? []).filter((b) => b.business_type === "food_vendor");
  const services = (businesses ?? []).filter((b) =>
    ["campus_service", "marketplace_seller"].includes(b.business_type),
  );

  const readyHousing = housing.filter((b) => b.setup_complete);
  if (!businesses?.length) {
    return (
      <Container>
        <div className="space-y-6 py-12">
          <PageHeader title="Listings" description="Apply and get approved first." />
          <ButtonLink href="/apply">Apply as business</ButtonLink>
        </div>
      </Container>
    );
  }

  const { data: properties } = readyHousing.length
    ? await supabase
        .from("properties")
        .select("id, title, is_published, business_id, property_units(id, title, status, is_published)")
        .in(
          "business_id",
          readyHousing.map((b) => b.id),
        )
        .order("created_at", { ascending: false })
    : { data: [] as never[] };

  const { data: menu } = food.some((b) => b.setup_complete)
    ? await supabase
        .from("menu_items")
        .select("id, name, price, is_published, business_id")
        .in(
          "business_id",
          food.filter((b) => b.setup_complete).map((b) => b.id),
        )
    : { data: [] as never[] };

  const readyServices = services.filter((b) => b.setup_complete);
  const { data: market } = readyServices.length
    ? await supabase
        .from("marketplace_listings")
        .select("id, title, price, status, kind, category")
        .in(
          "business_id",
          readyServices.map((b) => b.id),
        )
        .order("created_at", { ascending: false })
    : { data: [] as never[] };

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Listings"
          description="Publish only after CampusOS setup is complete. Everything stays campus-scoped."
        />

        <CampusScene
          mode="zones"
          title="Campus zones your listings serve"
          heightClass="h-48 sm:h-60"
          defaultOpen={false}
        />

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Housing</h2>
            {readyHousing[0] ? (
              <ButtonLink href={`/listings/housing/new?business=${readyHousing[0].id}`}>
                Add property
              </ButtonLink>
            ) : (
              <span className="text-sm text-muted">Finish housing business setup first</span>
            )}
          </div>
          {!properties?.length ? (
            <EmptyState
              title="No properties yet"
              description="Add a property and units. Students only see listings on their selected campus."
            />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {properties.map((property) => (
                <div key={property.id} className="px-4 py-3 text-sm">
                  <p className="font-medium">{property.title}</p>
                  <p className="text-muted">
                    {property.is_published ? "Published" : "Draft"} ·{" "}
                    {(property.property_units || []).length} units
                  </p>
                  <Link
                    href={`/listings/housing/${property.id}`}
                    className="mt-2 inline-block underline underline-offset-2"
                  >
                    Manage units
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Food menu</h2>
            {food.find((b) => b.setup_complete) ? (
              <ButtonLink
                href={`/listings/food/new?business=${food.find((b) => b.setup_complete)!.id}`}
              >
                Add menu item
              </ButtonLink>
            ) : (
              <span className="text-sm text-muted">Finish food business setup first</span>
            )}
          </div>
          {!menu?.length ? (
            <EmptyState title="No menu items" description="Add meals for pickup orders." />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {menu.map((item) => (
                <div key={item.id} className="flex justify-between px-4 py-3 text-sm">
                  <span>{item.name}</span>
                  <span className="text-muted">₦{Number(item.price).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Services / goods</h2>
            {readyServices[0] ? (
              <ButtonLink href={`/listings/market/new?business=${readyServices[0].id}`}>
                Add listing
              </ButtonLink>
            ) : (
              <span className="text-sm text-muted">Finish service/seller setup first</span>
            )}
          </div>
          {!market?.length ? (
            <EmptyState
              title="No marketplace listings"
              description="Campus service and marketplace posts appear on the student Marketplace for the same campus."
            />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {market.map((item) => (
                <div key={item.id} className="flex justify-between px-4 py-3 text-sm">
                  <span>
                    {item.title}
                    <span className="text-muted">
                      {" "}
                      · {item.kind} · {item.category}
                    </span>
                  </span>
                  <span className="text-muted">
                    {item.price != null ? `₦${Number(item.price).toLocaleString()}` : "Ask"} ·{" "}
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-wrap gap-3">
          <ButtonLink href="/listings/inspections" variant="secondary">
            Inspection requests
          </ButtonLink>
          <ButtonLink href="/listings/orders" variant="secondary">
            Food orders
          </ButtonLink>
          <ButtonLink href="/billing" variant="ghost">
            Billing
          </ButtonLink>
        </section>
      </div>
    </Container>
  );
}
