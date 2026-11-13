import { redirect } from "next/navigation";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { MarketForm } from "@/components/market-form";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function NewMarketPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string }>;
}) {
  const { business } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("business_profiles")
    .select("*")
    .eq("id", business || "")
    .eq("owner_user_id", user.id)
    .eq("setup_complete", true)
    .maybeSingle();
  if (!biz) redirect("/listings");

  return (
    <Container>
      <div className="mx-auto max-w-xl space-y-8 py-12">
        <PageHeader title="Add marketplace listing" description={biz.display_name} />
        <CampusScene
          mode="business"
          title="Where students browse goods & services"
          heightClass="h-44 sm:h-56"
          defaultOpen={false}
        />
        <MarketForm
          businessId={biz.id}
          campusId={biz.campus_id}
          sellerUserId={user.id}
          isCommercial={biz.business_type !== "campus_service"}
          defaultKind={biz.business_type === "campus_service" ? "service" : "goods"}
        />
      </div>
    </Container>
  );
}
