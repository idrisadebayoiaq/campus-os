import { redirect } from "next/navigation";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { MenuItemForm } from "@/components/menu-item-form";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function NewMenuItemPage({
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
    .select("id, display_name, setup_complete")
    .eq("id", business || "")
    .eq("owner_user_id", user.id)
    .eq("business_type", "food_vendor")
    .eq("setup_complete", true)
    .maybeSingle();
  if (!biz) redirect("/listings");

  return (
    <Container>
      <div className="mx-auto max-w-xl space-y-8 py-12">
        <PageHeader title="Add menu item" description={biz.display_name} />
        <CampusScene
          mode="business"
          title="Food pickup zone on campus"
          heightClass="h-44 sm:h-56"
          defaultOpen={false}
        />
        <MenuItemForm businessId={biz.id} />
      </div>
    </Container>
  );
}
