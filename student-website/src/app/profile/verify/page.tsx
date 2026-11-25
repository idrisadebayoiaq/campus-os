"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Container, Field, Input, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { isStudentVerified } from "@/lib/verification";

export default function ProfileVerifyPage() {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState(false);
  const [schoolEmail, setSchoolEmail] = useState("");
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?next=/profile/verify");
        return;
      }
      setVerified(await isStudentVerified(supabase, user.id));
      const { data: pend } = await supabase
        .from("student_verifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      setPending(Boolean(pend?.id));
      const { data: membership } = await supabase
        .from("campus_memberships")
        .select("institution_id")
        .eq("user_id", user.id)
        .eq("is_primary", true)
        .maybeSingle();
      setInstitutionId(membership?.institution_id || null);
      const { data: sp } = await supabase
        .from("student_profiles")
        .select("school_email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (sp?.school_email) setSchoolEmail(sp.school_email);
    }
    void load();
  }, [router]);

  async function onEmail(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const email = schoolEmail.trim().toLowerCase();
    const domain = email.split("@")[1];
    if (!domain) {
      setLoading(false);
      setStatus("Enter a valid school email.");
      return;
    }
    const { data: domainRows } = await supabase
      .from("institution_email_domains")
      .select("domain, institution_id")
      .ilike("domain", domain);
    let domainOk = Boolean(domainRows?.length);
    if (!domainOk && institutionId) {
      const { data: inst } = await supabase
        .from("institutions")
        .select("email_domain")
        .eq("id", institutionId)
        .maybeSingle();
      domainOk =
        !!inst?.email_domain &&
        inst.email_domain.toLowerCase().replace(/^@/, "") === domain;
    }
    if (!domainOk) {
      setLoading(false);
      setStatus("Email domain not registered for your school. Upload ID instead.");
      return;
    }
    await supabase
      .from("student_profiles")
      .update({ school_email: email })
      .eq("user_id", user.id);
    const { error } = await supabase.rpc("mark_student_verified", {
      p_user_id: user.id,
      p_method: "school_email",
      p_verified_by: user.id,
      p_evidence_path: null,
    });
    setLoading(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setVerified(true);
    setStatus("Verified with school email.");
  }

  async function onIdFile(file: File | null) {
    if (!file) return;
    setLoading(true);
    setStatus(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const ext = file.type.includes("png") ? "png" : "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("student-id-evidence")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) {
      setLoading(false);
      setStatus(uploadError.message);
      return;
    }
    const { error } = await supabase.from("student_verifications").insert({
      user_id: user.id,
      method: "id_document",
      status: "pending",
      evidence_path: path,
    });
    setLoading(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setPending(true);
    setStatus("ID submitted — waiting for school review.");
  }

  return (
    <Container className="space-y-6 py-8">
      <PageHeader
        title="Verify student"
        description="Verify once with school email, staff invite, or student ID."
      />
      <p className="text-sm text-muted">
        <Link href="/profile" className="underline">
          Back to profile
        </Link>
      </p>

      {verified ? (
        <div className="rounded-xl border border-border p-5">
          <p className="font-semibold">You are verified</p>
          <p className="mt-1 text-sm text-muted">
            Messaging sellers, food orders, and selling are unlocked.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending ? (
            <div className="rounded-xl border border-border p-5">
              <p className="font-semibold">ID under review</p>
              <p className="mt-1 text-sm text-muted">
                Your school authority will approve or reject soon.
              </p>
            </div>
          ) : null}

          <form
            onSubmit={onEmail}
            className="space-y-3 rounded-xl border border-border p-5"
          >
            <p className="font-semibold">School email</p>
            <Field label="Campus email">
              <Input
                value={schoolEmail}
                onChange={(e) => setSchoolEmail(e.target.value)}
                type="email"
                required
                placeholder="you@school.edu.ng"
              />
            </Field>
            <Button type="submit" disabled={loading}>
              {loading ? "…" : "Verify with email"}
            </Button>
          </form>

          <div className="space-y-3 rounded-xl border border-border p-5">
            <p className="font-semibold">Upload student ID</p>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => void onIdFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="rounded-xl border border-border p-5">
            <p className="font-semibold">Staff invite</p>
            <p className="mt-1 text-sm text-muted">
              If a lecturer or school authority adds you to a class, you are
              verified automatically.
            </p>
          </div>
        </div>
      )}

      {status ? <p className="text-sm text-muted">{status}</p> : null}
    </Container>
  );
}
