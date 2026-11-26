import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MediaManager, type MediaRow } from "@/components/media-manager";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Menu item photos" };
export const instant = false;

export default async function ManageMenuItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: item } = await supabase
    .from("menu_items")
    .select("id, name, price, category, business_profiles!inner(owner_user_id, display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!item) notFound();
  const business = Array.isArray(item.business_profiles)
    ? item.business_profiles[0]
    : item.business_profiles;
  if (business?.owner_user_id !== user.id) notFound();

  const { data: media } = await supabase
    .from("listing_media")
    .select("id, url, kind, caption, is_cover, sort_order, storage_path")
    .eq("menu_item_id", item.id)
    .order("sort_order", { ascending: true });

  return (
    <Container>
      <div className="mx-auto max-w-3xl space-y-6 py-8 sm:py-12">
        <PageHeader
          title={item.name}
          description={`${business.display_name} · ₦${Number(item.price).toLocaleString()} · ${item.category}`}
        />
        <MediaManager
          userId={user.id}
          target={{ column: "menu_item_id", id: item.id }}
          initial={(media ?? []) as MediaRow[]}
          title="Meal photos & videos"
          hint="show the plate, packaging, and portions"
        />
        <Link href="/listings" className="inline-block text-sm text-muted hover:text-fg">
          ← Back to menu
        </Link>
      </div>
    </Container>
  );
}
