import type { SupabaseClient } from "@supabase/supabase-js";

export type StudentCampus = {
  membershipId: string;
  institutionId: string;
  campusId: string;
  institutionName: string;
  campusName: string;
  city: string | null;
  state: string | null;
};

export async function getStudentCampus(
  client: SupabaseClient,
  userId?: string | null,
): Promise<StudentCampus | null> {
  if (!userId) {
    const {
      data: { user },
    } = await client.auth.getUser();
    userId = user?.id;
  }
  if (!userId) return null;

  const { data } = await client
    .from("campus_memberships")
    .select(
      "id, institution_id, campus_id, institutions(name), campuses(name, city, state)",
    )
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();

  if (!data) return targetSchoolCampus(client, userId);

  const institution = Array.isArray(data.institutions)
    ? data.institutions[0]
    : data.institutions;
  const campus = Array.isArray(data.campuses) ? data.campuses[0] : data.campuses;

  return {
    membershipId: data.id,
    institutionId: data.institution_id,
    campusId: data.campus_id,
    institutionName: institution?.name ?? "School",
    campusName: campus?.name ?? "Campus",
    city: campus?.city ?? null,
    state: campus?.state ?? null,
  };
}

/**
 * Exam candidates are not in a school yet. They browse housing and the marketplace around the
 * school they want to attend, which they choose in Exam goals.
 */
async function targetSchoolCampus(client: SupabaseClient, userId: string): Promise<StudentCampus | null> {
  const { data: profile } = await client
    .from("student_profiles")
    .select("target_campus_id")
    .eq("user_id", userId)
    .maybeSingle();
  const campusId = profile?.target_campus_id as string | null | undefined;
  if (!campusId) return null;

  const { data } = await client
    .from("campuses")
    .select("id, name, city, state, institution_id, institutions(name)")
    .eq("id", campusId)
    .maybeSingle();
  if (!data) return null;

  const institution = Array.isArray(data.institutions) ? data.institutions[0] : data.institutions;
  return {
    membershipId: "",
    institutionId: data.institution_id,
    campusId: data.id,
    institutionName: institution?.name ?? "School",
    campusName: data.name ?? "Campus",
    city: data.city ?? null,
    state: data.state ?? null,
  };
}

export function formatNaira(amount: number | string | null | undefined) {
  const value = Number(amount || 0);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

export function unitTotal(unit: {
  rent_base?: number | null;
  fee_agent?: number | null;
  fee_agreement?: number | null;
  fee_caution?: number | null;
  fee_service?: number | null;
}) {
  return (
    Number(unit.rent_base || 0) +
    Number(unit.fee_agent || 0) +
    Number(unit.fee_agreement || 0) +
    Number(unit.fee_caution || 0) +
    Number(unit.fee_service || 0)
  );
}
