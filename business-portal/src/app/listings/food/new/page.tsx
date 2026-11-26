import { redirect } from "next/navigation";
import { CampusScene } from "@/components/campus-3d/campus-scene";
import { MenuItemForm } from "@/components/menu-item-form";
import { Container, PageHeader } from "@/components/ui";
import { canManage, myBusinesses } from "@/lib/business";
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

  const biz = (await myBusinesses(supabase, user.id)).find(
    (b) => b.id === business && b.business_type === "food_vendor" && b.setup_complete && canManage(b.role),
  );
  if (!biz) redirect("/listings");

  return (
    <Container>
      <div className="mx-auto max-w-xl space-y-8 py-8 sm:py-12">
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
