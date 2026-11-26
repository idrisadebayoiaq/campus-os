import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamRole = "owner" | "manager" | "staff";

export type MyBusiness = {
  id: string;
  display_name: string;
  business_type: string;
  setup_complete: boolean;
  slug: string | null;
  owner_user_id: string;
  accepting_orders: boolean;
  lat: number | null;
  lng: number | null;
  role: TeamRole;
};

const FIELDS =
  "id, display_name, business_type, setup_complete, slug, owner_user_id, accepting_orders, lat, lng";

/** Businesses the user owns plus the ones they were invited to help run. */
export async function myBusinesses(supabase: SupabaseClient, userId: string): Promise<MyBusiness[]> {
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from("business_profiles").select(FIELDS).eq("owner_user_id", userId),
    supabase.from("business_members").select("business_id, role").eq("user_id", userId),
  ]);

  const list: MyBusiness[] = ((owned ?? []) as Omit<MyBusiness, "role">[]).map((b) => ({
    ...b,
    role: "owner" as const,
  }));

  const memberIds = (memberships ?? []).map((m) => m.business_id as string);
  if (memberIds.length) {
    const { data: joined } = await supabase.from("business_profiles").select(FIELDS).in("id", memberIds);
    for (const b of (joined ?? []) as Omit<MyBusiness, "role">[]) {
      const role = (memberships ?? []).find((m) => m.business_id === b.id)?.role as TeamRole | undefined;
      if (!list.some((x) => x.id === b.id)) list.push({ ...b, role: role ?? "staff" });
    }
  }
  return list;
}

export function canManage(role: TeamRole) {
  return role === "owner" || role === "manager";
}
