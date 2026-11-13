import { PortalNav } from "@/components/portal-nav";
import { createClient } from "@/lib/supabase/server";

export async function PortalNavServer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <PortalNav email={user?.email} />;
}

export function PortalNavFallback() {
  return <PortalNav email={null} />;
}
