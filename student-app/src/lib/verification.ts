import type { SupabaseClient } from "@supabase/supabase-js";

export type VerificationMethod =
  | "school_email"
  | "institution_invite"
  | "id_document";

/** True when student is campus-verified (any accepted path). */
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

export function verificationGateMessage() {
  return "Verify your student ID to continue.";
}

/** Match school email against institution domains and auto-verify. */
export async function verifyWithSchoolEmail(
  supabase: SupabaseClient,
  userId: string,
  schoolEmail: string,
  institutionId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = schoolEmail.trim().toLowerCase();
  const domain = email.split("@")[1];
  if (!domain) return { ok: false, error: "Enter a valid school email." };

  let domainOk = false;

  const { data: domainRows } = await supabase
    .from("institution_email_domains")
    .select("domain, institution_id")
    .ilike("domain", domain);

  if (domainRows?.length) {
    domainOk = institutionId
      ? domainRows.some((d) => d.institution_id === institutionId)
      : true;
  }

  if (!domainOk && institutionId) {
    const { data: inst } = await supabase
      .from("institutions")
      .select("email_domain")
      .eq("id", institutionId)
      .maybeSingle();
    if (
      inst?.email_domain &&
      inst.email_domain.toLowerCase().replace(/^@/, "") === domain
    ) {
      domainOk = true;
    }
  }

  if (!domainOk) {
    return {
      ok: false,
      error: "Email domain is not registered for your school. Upload your ID instead.",
    };
  }

  await supabase
    .from("student_profiles")
    .update({ school_email: email, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  const { error } = await supabase.rpc("mark_student_verified", {
    p_user_id: userId,
    p_method: "school_email",
    p_verified_by: userId,
    p_evidence_path: null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Submit campus/student ID for staff review. */
export async function submitIdDocument(
  supabase: SupabaseClient,
  userId: string,
  localUri: string,
  mimeType?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ext = mimeType?.includes("png")
    ? "png"
    : mimeType?.includes("webp")
      ? "webp"
      : "jpg";
  const contentType = mimeType || `image/${ext === "jpg" ? "jpeg" : ext}`;
  const path = `${userId}/${Date.now()}.${ext}`;
  const response = await fetch(localUri);
  const buffer = await response.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("student-id-evidence")
    .upload(path, buffer, { contentType, upsert: true });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { error } = await supabase.from("student_verifications").insert({
    user_id: userId,
    method: "id_document",
    status: "pending",
    evidence_path: path,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
