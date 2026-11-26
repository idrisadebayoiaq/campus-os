import type { SupabaseClient } from "@supabase/supabase-js";

/** Which of these accounts (students or businesses) have an active Premium plan. */
export async function loadPremiumIds(supabase: SupabaseClient, ids: (string | null | undefined)[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unique.length) return new Set();
  const { data } = await supabase.rpc("premium_ids", { p_ids: unique });
  return new Set(Array.isArray(data) ? (data as string[]) : []);
}
