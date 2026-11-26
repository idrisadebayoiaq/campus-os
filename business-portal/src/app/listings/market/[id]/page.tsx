import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MediaManager, type MediaRow } from "@/components/media-manager";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Listing photos" };
export const instant = false;

export default async function ManageMarketListingPage({
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

  const { data: listing } = await supabase
    .from("marketplace_listings")
    .select("id, title, price, kind, category, seller_user_id, business_profiles(owner_user_id)")
    .eq("id", id)
    .maybeSingle();
  if (!listing) notFound();
  const business = Array.isArray(listing.business_profiles)
    ? listing.business_profiles[0]
    : listing.business_profiles;
  if (listing.seller_user_id !== user.id && business?.owner_user_id !== user.id) notFound();

  const { data: media } = await supabase
    .from("listing_media")
    .select("id, url, kind, caption, is_cover, sort_order, storage_path")
    .eq("market_listing_id", listing.id)
    .order("sort_order", { ascending: true });

  return (
    <Container>
      <div className="mx-auto max-w-3xl space-y-6 py-8 sm:py-12">
        <PageHeader
          title={listing.title}
          description={`${listing.kind} · ${listing.category}${
            listing.price != null ? ` · ₦${Number(listing.price).toLocaleString()}` : ""
          }`}
        />
        <MediaManager
          userId={user.id}
          target={{ column: "market_listing_id", id: listing.id }}
          initial={(media ?? []) as MediaRow[]}
          title="Photos & videos"
          hint="clear photos help students trust your listing"
        />
        <Link href="/listings" className="inline-block text-sm text-muted hover:text-fg">
          ← Back to listings
        </Link>
      </div>
    </Container>
  );
}
