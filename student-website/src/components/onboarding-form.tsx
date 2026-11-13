"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field } from "@/components/ui";

type Campus = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

type Institution = {
  id: string;
  name: string;
  short_name: string | null;
  campuses: Campus[];
};

export function OnboardingForm({ institutions }: { institutions: Institution[] }) {
  const router = useRouter();
  const [institutionId, setInstitutionId] = useState(institutions[0]?.id ?? "");
  const campuses = useMemo(
    () => institutions.find((item) => item.id === institutionId)?.campuses ?? [],
    [institutionId, institutions],
  );
  const [campusId, setCampusId] = useState(campuses[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      setError("Please log in first.");
      return;
    }

    const selectedCampusId = campusId || campuses[0]?.id;
    if (!institutionId || !selectedCampusId) {
      setLoading(false);
      setError("Select a school and campus.");
      return;
    }

    await supabase
      .from("campus_memberships")
      .update({ is_primary: false })
      .eq("user_id", user.id);

    const { error: upsertError } = await supabase.from("campus_memberships").upsert(
      {
        user_id: user.id,
        institution_id: institutionId,
        campus_id: selectedCampusId,
        is_primary: true,
      },
      { onConflict: "user_id,campus_id" },
    );

    setLoading(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Institution">
        <select
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none focus:border-fg"
          value={institutionId}
          onChange={(event) => {
            const nextId = event.target.value;
            setInstitutionId(nextId);
            const nextCampus =
              institutions.find((item) => item.id === nextId)?.campuses?.[0]?.id ?? "";
            setCampusId(nextCampus);
          }}
          required
        >
          {institutions.map((institution) => (
            <option key={institution.id} value={institution.id}>
              {institution.name}
              {institution.short_name ? ` (${institution.short_name})` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Campus">
        <select
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none focus:border-fg"
          value={campusId || campuses[0]?.id || ""}
          onChange={(event) => setCampusId(event.target.value)}
          required
        >
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.name}
              {campus.city ? ` · ${campus.city}` : ""}
            </option>
          ))}
        </select>
      </Field>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Button type="submit" disabled={loading || institutions.length === 0}>
        {loading ? "Saving…" : "Save campus and continue"}
      </Button>
    </form>
  );
}
