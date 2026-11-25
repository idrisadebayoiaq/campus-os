import type { SupabaseClient } from "@supabase/supabase-js";

export async function isStudentVerified(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const [{ data: enroll }, { data: profile }, { data: approved }] =
    await Promise.all([
      supabase
        .from("student_enrollments")
        .select("verification_status")
        .eq("user_id", userId)
        .eq("is_primary", true)
        .maybeSingle(),
      supabase
        .from("student_profiles")
        .select("verification_level")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("student_verifications")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle(),
    ]);

  return (
    enroll?.verification_status === "verified" ||
    profile?.verification_level === "verified" ||
    Boolean(approved?.id)
  );
}

export const VERIFICATION_GATE =
  "Verify your student ID to continue. Open Profile → Verify.";
