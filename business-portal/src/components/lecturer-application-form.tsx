"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";

type Institution = { id: string; name: string; short_name: string | null };
type Campus = { id: string; name: string; institution_id: string };
type Department = { id: string; name: string; institution_id: string };

export function LecturerApplicationForm({
  defaultPersonalEmail,
  defaultFullName,
}: {
  defaultPersonalEmail?: string | null;
  defaultFullName?: string | null;
}) {
  const router = useRouter();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const [{ data: inst }, { data: camps }, { data: deps }] = await Promise.all([
        supabase
          .from("institutions")
          .select("id, name, short_name")
          .eq("is_active", true)
          .order("name"),
        supabase.from("campuses").select("id, name, institution_id").eq("is_active", true),
        supabase.from("departments").select("id, name, institution_id").order("name"),
      ]);
      setInstitutions((inst as Institution[]) || []);
      setCampuses((camps as Campus[]) || []);
      setDepartments((deps as Department[]) || []);
    })();
  }, []);

  const filteredCampuses = useMemo(
    () => campuses.filter((c) => c.institution_id === institutionId),
    [campuses, institutionId],
  );
  const filteredDepartments = useMemo(
    () => departments.filter((d) => d.institution_id === institutionId),
    [departments, institutionId],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("submit_lecturer_application", {
      inst_id: String(form.get("institution_id")),
      dept_id: String(form.get("department_id") || "") || null,
      campus_id_input: String(form.get("campus_id") || "") || null,
      full_name: String(form.get("full_name") || ""),
      personal_email: String(form.get("personal_email") || ""),
      school_email: String(form.get("school_email") || ""),
      staff_title: String(form.get("staff_title") || "") || null,
      note: String(form.get("note") || "") || null,
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border p-5">
      <Field label="Full name">
        <Input name="full_name" required defaultValue={defaultFullName || ""} />
      </Field>
      <Field label="Personal email (login)">
        <Input
          name="personal_email"
          type="email"
          required
          defaultValue={defaultPersonalEmail || ""}
        />
      </Field>
      <Field label="School email (for verification)">
        <Input
          name="school_email"
          type="email"
          required
          placeholder="you@university.edu.ng"
        />
      </Field>
      <Field label="School">
        <select
          name="institution_id"
          required
          value={institutionId}
          onChange={(e) => setInstitutionId(e.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
        >
          <option value="">Select registered school</option>
          {institutions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
              {i.short_name ? ` (${i.short_name})` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Campus">
        <select
          name="campus_id"
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
          disabled={!institutionId}
        >
          <option value="">Optional</option>
          {filteredCampuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Department">
        <select
          name="department_id"
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
          disabled={!institutionId}
        >
          <option value="">Optional / select if listed</option>
          {filteredDepartments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title">
        <Input name="staff_title" placeholder="e.g. Senior Lecturer" />
      </Field>
      <Field label="Note to school authority">
        <textarea
          name="note"
          rows={3}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          placeholder="Staff ID, faculty, or other proof"
        />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Submitting…" : "Submit lecturer application"}
      </Button>
    </form>
  );
}
