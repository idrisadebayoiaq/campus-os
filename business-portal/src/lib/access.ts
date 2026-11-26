import type { SupabaseClient } from "@supabase/supabase-js";
import { personasFor, type AccessInfo, type Persona } from "@/lib/persona";

/** Loads everything needed to decide what kind of account this user has. */
export async function loadAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccessInfo & { personas: Persona[] }> {
  const [{ data: roleRows }, { data: bizRows }, { data: appRows }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("business_profiles").select("business_type").eq("owner_user_id", userId),
    supabase
      .from("business_applications")
      .select("business_type, status")
      .eq("user_id", userId)
      .in("status", ["draft", "submitted", "under_review", "needs_changes"]),
  ]);

  const info: AccessInfo = {
    roles: (roleRows ?? []).map((r) => String(r.role)),
    businessTypes: (bizRows ?? []).map((b) => String(b.business_type)),
    pendingTypes: (appRows ?? []).map((a) => String(a.business_type)),
  };
  return { ...info, personas: personasFor(info) };
}
