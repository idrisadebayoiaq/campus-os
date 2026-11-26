import type { SupabaseClient } from "@supabase/supabase-js";

export type BizMeta = {
  rating: number | null;
  reviews: number;
  replyMinutes: number | null;
  level: "basic" | "identity" | "cac";
  endorsed: boolean;
  open: boolean | null;
};

const EMPTY: BizMeta = { rating: null, reviews: 0, replyMinutes: null, level: "basic", endorsed: false, open: null };

/** Ratings, reply speed, verification level, school approval and open state for a set of businesses. */
export async function loadBizMeta(
  supabase: SupabaseClient,
  ids: string[],
  opts: { checkOpen?: string[] } = {},
): Promise<Record<string, BizMeta>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const out: Record<string, BizMeta> = {};
  for (const id of unique) out[id] = { ...EMPTY };
  if (!unique.length) return out;

  const [ratings, replies, profiles, endorsed] = await Promise.all([
    supabase.rpc("business_rating_stats", { p_ids: unique }),
    supabase.rpc("business_reply_stats", { p_ids: unique }),
    supabase.from("business_profiles").select("id, verification_level").in("id", unique),
    supabase.rpc("endorsed_business_ids", { p_ids: unique }),
  ]);

  for (const r of (ratings.data ?? []) as { business_id: string; avg_rating: number; review_count: number }[]) {
    if (out[r.business_id]) out[r.business_id] = { ...out[r.business_id], rating: Number(r.avg_rating), reviews: r.review_count };
  }
  for (const r of (replies.data ?? []) as { business_id: string; median_minutes: number; sample: number }[]) {
    if (out[r.business_id] && r.sample >= 3) out[r.business_id].replyMinutes = Number(r.median_minutes);
  }
  for (const p of (profiles.data ?? []) as { id: string; verification_level: BizMeta["level"] }[]) {
    if (out[p.id]) out[p.id].level = p.verification_level ?? "basic";
  }
  for (const id of (endorsed.data ?? []) as string[]) {
    if (out[id]) out[id].endorsed = true;
  }

  const openIds = (opts.checkOpen ?? []).filter((id) => out[id]);
  await Promise.all(
    openIds.map(async (id) => {
      const { data } = await supabase.rpc("business_open_now", { p_business: id });
      out[id].open = typeof data === "boolean" ? data : null;
    }),
  );
  return out;
}

export function replyLabel(minutes: number | null) {
  if (minutes == null) return null;
  if (minutes <= 5) return "Replies within minutes";
  if (minutes <= 30) return `Replies in ~${Math.round(minutes / 5) * 5} min`;
  if (minutes <= 120) return "Replies within 2 hours";
  if (minutes <= 24 * 60) return "Replies within a day";
  return null;
}

export function levelLabel(level: BizMeta["level"]) {
  if (level === "cac") return "CAC verified";
  if (level === "identity") return "ID checked";
  return null;
}

/** One short line for cards: rating · reply speed. */
export function metaLine(meta: BizMeta | undefined) {
  if (!meta) return "";
  const parts: string[] = [];
  if (meta.rating != null) parts.push(`★ ${meta.rating.toFixed(1)} (${meta.reviews})`);
  const reply = replyLabel(meta.replyMinutes);
  if (reply) parts.push(reply);
  return parts.join(" · ");
}

/** Keys like "property_unit:<id>" for everything currently featured. */
export async function loadFeatured(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from("listing_boosts")
    .select("entity_type, entity_id")
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString());
  return new Set(((data ?? []) as { entity_type: string; entity_id: string }[]).map((b) => `${b.entity_type}:${b.entity_id}`));
}

/** Fire-and-forget usage events that power the business Insights page. */
export function trackEvent(
  supabase: SupabaseClient,
  userId: string | undefined,
  name: "view" | "save" | "start_chat" | "order_start",
  entityType: "business" | "property_unit" | "marketplace_listing",
  entityId: string,
) {
  if (!userId) return;
  void supabase
    .from("analytics_events")
    .insert({ user_id: userId, event_name: name, entity_type: entityType, entity_id: entityId })
    .then(() => undefined);
}
