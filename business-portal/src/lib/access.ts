import type { SupabaseClient } from "@supabase/supabase-js";
import { myBusinesses } from "@/lib/business";
import { personasFor, type AccessInfo, type Persona } from "@/lib/persona";

/** Loads everything needed to decide what kind of account this user has. */
export async function loadAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccessInfo & { personas: Persona[] }> {
  const [{ data: roleRows }, businesses, { data: appRows }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    myBusinesses(supabase, userId),
    supabase
      .from("business_applications")
      .select("business_type, status")
      .eq("user_id", userId)
      .in("status", ["draft", "submitted", "under_review", "needs_changes"]),
  ]);

  const info: AccessInfo = {
    roles: (roleRows ?? []).map((r) => String(r.role)),
    businessTypes: businesses.map((b) => b.business_type),
    pendingTypes: (appRows ?? []).map((a) => String(a.business_type)),
  };
  return { ...info, personas: personasFor(info) };
}
