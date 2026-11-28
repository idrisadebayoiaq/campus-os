"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

export function ClassRosterForm({ classId }: { classId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: studentId, error: rpcError } = await supabase.rpc(
      "lookup_user_id_by_email",
      { p_email: email },
    );

    if (rpcError) {
      setLoading(false);
      setError(rpcError.message);
      return;
    }
    if (!studentId) {
      setLoading(false);
      setError("No CampusOS account found with that email.");
      return;
    }

    const { error: enrollError } = await supabase.from("class_enrollments").upsert(
      {
        class_id: classId,
        student_user_id: studentId as string,
        status: "active",
        source: "manual",
        added_by: user?.id || null,
      },
      { onConflict: "class_id,student_user_id" },
    );

    if (enrollError) {
      setLoading(false);
      setError(enrollError.message);
      return;
    }

    // Staff add = institution invite verification (no second ID step)
    const { error: verifyError } = await supabase.rpc("mark_student_verified", {
      p_user_id: studentId as string,
      p_method: "institution_invite",
      p_verified_by: user?.id || null,
      p_evidence_path: null,
    });

    setLoading(false);
    if (verifyError) {
      setOk("Student added to class (verification sync failed — retry from Verifications).");
    } else {
      setOk("Student added and marked verified.");
    }
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-border p-4">
      <Field label="Add student by CampusOS email">
        <Input name="email" type="email" required placeholder="student@email.com" />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-success">{ok}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Adding…" : "Add student"}
      </Button>
    </form>
  );
}
