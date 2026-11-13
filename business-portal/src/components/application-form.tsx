"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BusinessTypeKey } from "@/lib/business-types";
import { Button, Field, Input } from "@/components/ui";

type Campus = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  institutions:
    | { name: string; short_name: string | null }
    | { name: string; short_name: string | null }[]
    | null;
};

export function ApplicationForm({
  businessType,
  campuses,
  defaults,
}: {
  businessType: BusinessTypeKey;
  campuses: Campus[];
  defaults: { owner_full_name: string; phone: string; email: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [campusQuery, setCampusQuery] = useState("");
  const [campusId, setCampusId] = useState(campuses[0]?.id || "");

  const filteredCampuses = useMemo(() => {
    const q = campusQuery.trim().toLowerCase();
    if (!q) return campuses;
    return campuses.filter((campus) => {
      const institution = Array.isArray(campus.institutions)
        ? campus.institutions[0]
        : campus.institutions;
      const hay = `${institution?.name || ""} ${institution?.short_name || ""} ${campus.name} ${campus.city || ""} ${campus.state || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [campuses, campusQuery]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      setError("Please log in again.");
      return;
    }

    const idDoc = form.get("id_document") as File | null;
    const proofDoc = form.get("proof_document") as File | null;

    const payload = {
      user_id: user.id,
      business_type: businessType,
      status: "submitted" as const,
      business_name: String(form.get("business_name") || "").trim(),
      owner_full_name: String(form.get("owner_full_name") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      email: String(form.get("email") || "").trim(),
      description: String(form.get("description") || "").trim() || null,
      campus_id: String(form.get("campus_id") || "") || null,
      service_zones: String(form.get("service_zones") || "")
        .split(",")
        .map((z) => z.trim())
        .filter(Boolean),
      address_text: String(form.get("address_text") || "").trim() || null,
      extra: {
        years_operating: String(form.get("years_operating") || "").trim() || null,
        website_or_social: String(form.get("website_or_social") || "").trim() || null,
      },
      submitted_at: new Date().toISOString(),
    };

    const { data: app, error: insertError } = await supabase
      .from("business_applications")
      .insert(payload)
      .select("id")
      .single();

    if (insertError || !app) {
      setLoading(false);
      setError(insertError?.message || "Could not submit application.");
      return;
    }

    async function uploadDoc(file: File | null, docType: string) {
      if (!file || file.size === 0 || !user) return;
      const path = `${user.id}/${app!.id}/${docType}-${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("application-docs")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { error: metaError } = await supabase.from("application_documents").insert({
        application_id: app!.id,
        doc_type: docType,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: user.id,
      });
      if (metaError) throw metaError;
    }

    try {
      await uploadDoc(idDoc, "owner_id");
      await uploadDoc(proofDoc, businessType === "housing_provider" ? "authorization" : "store_proof");
    } catch (uploadErr) {
      setLoading(false);
      setError(
        uploadErr instanceof Error
          ? `Application saved, but document upload failed: ${uploadErr.message}`
          : "Application saved, but document upload failed.",
      );
      router.push(`/applications/${app.id}`);
      return;
    }

    setLoading(false);
    router.push(`/applications/${app.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Business / trading name">
        <Input name="business_name" required />
      </Field>
      <Field label="Owner full name">
        <Input name="owner_full_name" required defaultValue={defaults.owner_full_name} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <Input name="phone" required defaultValue={defaults.phone} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" required defaultValue={defaults.email} />
        </Field>
      </div>
      <Field label="Search campus">
        <Input
          value={campusQuery}
          onChange={(e) => setCampusQuery(e.target.value)}
          placeholder="School name, short code, city, or state"
        />
      </Field>
      <Field label={`Campus to serve (${filteredCampuses.length} shown)`}>
        <select
          name="campus_id"
          required
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none focus:border-fg"
          value={filteredCampuses.some((c) => c.id === campusId) ? campusId : filteredCampuses[0]?.id || ""}
          onChange={(e) => setCampusId(e.target.value)}
        >
          {!filteredCampuses.length ? <option value="">No campuses match</option> : null}
          {filteredCampuses.map((campus) => {
            const institution = Array.isArray(campus.institutions)
              ? campus.institutions[0]
              : campus.institutions;
            return (
              <option key={campus.id} value={campus.id}>
                {institution?.name ? `${institution.name} · ` : ""}
                {campus.name}
                {campus.city ? ` (${campus.city})` : ""}
              </option>
            );
          })}
        </select>
      </Field>
      <Field label="Service zones / neighborhoods (comma-separated)">
        <Input name="service_zones" placeholder="Gate Area, Behind Campus" />
      </Field>
      <Field label="Operating address / base">
        <Input name="address_text" />
      </Field>
      <Field label="Short description">
        <textarea
          name="description"
          rows={4}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-fg"
          placeholder="What you offer and who you serve"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Years operating (optional)">
          <Input name="years_operating" />
        </Field>
        <Field label="Website / social (optional)">
          <Input name="website_or_social" />
        </Field>
      </div>
      <Field label="Owner ID document (image or PDF)">
        <Input name="id_document" type="file" accept="image/*,application/pdf" required />
      </Field>
      <Field
        label={
          businessType === "housing_provider"
            ? "Ownership / authorization proof"
            : "Store / business proof photo"
        }
      >
        <Input name="proof_document" type="file" accept="image/*,application/pdf" required />
      </Field>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Submitting…" : "Submit for review"}
      </Button>
    </form>
  );
}
