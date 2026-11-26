"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LocationPicker } from "@/components/location-picker";
import { Button, Field, Input } from "@/components/ui";

type Institution = { id: string; name: string; short_name: string | null };

export function AdminSchoolForm() {
  const router = useRouter();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("institutions")
      .select("id, name, short_name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setInstitutions((data as Institution[]) || []));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    let institutionId = String(form.get("institution_id") || "");
    try {
      if (mode === "new") {
        const name = String(form.get("new_name") || "").trim();
        const shortName = String(form.get("new_short_name") || "").trim() || null;
        const type = String(form.get("institution_type") || "university");
        const { data, error: instError } = await supabase
          .from("institutions")
          .insert({
            name,
            short_name: shortName,
            institution_type: type,
            is_active: true,
            email_domain: String(form.get("domains") || "")
              .split(",")[0]
              ?.trim()
              .toLowerCase() || null,
          })
          .select("id")
          .single();
        if (instError || !data) throw instError || new Error("Could not create school");
        institutionId = data.id;

        const campusName = String(form.get("campus_name") || "Main campus").trim();
        const city = String(form.get("city") || "").trim() || null;
        const state = String(form.get("state") || "").trim() || null;
        await supabase.from("campuses").insert({
          institution_id: institutionId,
          name: campusName,
          city,
          state,
          lat: Number(form.get("campus_lat")) || null,
          lng: Number(form.get("campus_lng")) || null,
          is_active: true,
        });
      }

      const domains = String(form.get("domains") || "")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);

      const { error: rpcError } = await supabase.rpc("admin_register_school_authority", {
        inst_id: institutionId,
        authority_email: String(form.get("authority_email") || ""),
        authority_full_name: String(form.get("authority_full_name") || ""),
        domains,
        authority_title: String(form.get("authority_title") || "School Administrator"),
      });
      if (rpcError) throw rpcError;

      setOk("School authority linked. They can approve lecturers for this institution.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register school");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border p-5">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          className={`rounded-md px-3 py-2 ${mode === "existing" ? "bg-inverse-bg text-inverse-fg" : "border border-border"}`}
          onClick={() => setMode("existing")}
        >
          Existing school
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-2 ${mode === "new" ? "bg-inverse-bg text-inverse-fg" : "border border-border"}`}
          onClick={() => setMode("new")}
        >
          Register new school
        </button>
      </div>

      {mode === "existing" ? (
        <Field label="Institution">
          <select
            name="institution_id"
            required
            className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
          >
            <option value="">Select</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <Field label="School name">
            <Input name="new_name" required placeholder="Federal University of …" />
          </Field>
          <Field label="Short name">
            <Input name="new_short_name" placeholder="FUTA" />
          </Field>
          <Field label="Type">
            <select
              name="institution_type"
              className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              defaultValue="university"
            >
              {[
                "university",
                "polytechnic",
                "college_of_education",
                "college",
                "monotechnic",
                "other",
              ].map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Main campus name">
            <Input name="campus_name" defaultValue="Main campus" />
          </Field>
          <Field label="Campus location">
            <LocationPicker
              names={{ address: "campus_address", lat: "campus_lat", lng: "campus_lng" }}
              required
              addressLabel="Campus address"
              addressHint="Drop the pin on the main gate. Students near here will see this school first."
              onChange={(p) => {
                if (p?.city) setCity(p.city);
                if (p?.state) setState(p.state.replace(/\s+State$/i, ""));
              }}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="City">
              <Input name="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="State">
              <Input name="state" value={state} onChange={(e) => setState(e.target.value)} />
            </Field>
          </div>
        </>
      )}

      <Field label="Allowed school email domains (comma-separated)">
        <Input name="domains" required placeholder="unilag.edu.ng, staff.unilag.edu.ng" />
      </Field>
      <Field label="Authority full name">
        <Input name="authority_full_name" required />
      </Field>
      <Field label="Authority portal email (must already have an account)">
        <Input name="authority_email" type="email" required placeholder="admin@school.edu.ng" />
      </Field>
      <Field label="Authority title">
        <Input name="authority_title" defaultValue="School Administrator" />
      </Field>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {ok ? <p className="text-sm text-success">{ok}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Saving…" : "Register school authority"}
      </Button>
    </form>
  );
}
