import type { SupabaseClient } from "@supabase/supabase-js";

export async function trackEvent(
  supabase: SupabaseClient,
  eventName: string,
  opts?: {
    userId?: string | null;
    campusId?: string | null;
    entityType?: string;
    entityId?: string;
    meta?: Record<string, unknown>;
  },
) {
  try {
    await supabase.from("analytics_events").insert({
      user_id: opts?.userId ?? null,
      campus_id: opts?.campusId ?? null,
      event_name: eventName,
      entity_type: opts?.entityType ?? null,
      entity_id: opts?.entityId ?? null,
      meta: opts?.meta ?? {},
    });
  } catch {
    // Non-blocking analytics
  }
}
