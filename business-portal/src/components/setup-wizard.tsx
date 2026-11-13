"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DAYS,
  SETUP_STEPS,
  defaultHours,
  type HoursMap,
  type SetupStepKey,
} from "@/lib/setup";
import { Button, Field, Input } from "@/components/ui";

type Business = {
  id: string;
  display_name: string;
  bio: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  service_zones: string[] | null;
  logo_url: string | null;
  cover_url: string | null;
  hours: HoursMap | null;
  show_phone_public: boolean;
  show_whatsapp_public: boolean;
  show_email_public: boolean;
  setup_complete: boolean;
  setup_step: string;
  slug: string | null;
};

type Payment = {
  account_name: string;
  bank_name: string;
  account_number: string;
  bank_code: string | null;
} | null;

type Campus = {
  id: string;
  name: string;
  city: string | null;
};

export function SetupWizard({
  business,
  payment,
  campuses,
  campusId,
  userId,
  studentSiteUrl,
}: {
  business: Business;
  payment: Payment;
  campuses: Campus[];
  campusId: string | null;
  userId: string;
  studentSiteUrl: string;
}) {
  const router = useRouter();
  const initialStep = (SETUP_STEPS.find((s) => s.key === business.setup_step)?.key ??
    "profile") as SetupStepKey;
  const [step, setStep] = useState<SetupStepKey>(
    business.setup_complete ? "review" : initialStep,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(business.setup_complete);

  const [displayName, setDisplayName] = useState(business.display_name);
  const [bio, setBio] = useState(business.bio ?? "");
  const [zones, setZones] = useState((business.service_zones ?? []).join(", "));
  const [selectedCampus, setSelectedCampus] = useState(campusId ?? campuses[0]?.id ?? "");
  const [campusQuery, setCampusQuery] = useState("");
  const [logoUrl, setLogoUrl] = useState(business.logo_url);
  const [coverUrl, setCoverUrl] = useState(business.cover_url);

  const filteredCampuses = useMemo(() => {
    const q = campusQuery.trim().toLowerCase();
    if (!q) return campuses;
    return campuses.filter((c) =>
      `${c.name} ${c.city || ""}`.toLowerCase().includes(q),
    );
  }, [campuses, campusQuery]);

  const [hours, setHours] = useState<HoursMap>(
    business.hours && typeof business.hours === "object"
      ? { ...defaultHours(), ...business.hours }
      : defaultHours(),
  );

  const [phone, setPhone] = useState(business.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(business.whatsapp ?? "");
  const [email, setEmail] = useState(business.email ?? "");
  const [showPhone, setShowPhone] = useState(business.show_phone_public);
  const [showWhatsapp, setShowWhatsapp] = useState(business.show_whatsapp_public);
  const [showEmail, setShowEmail] = useState(business.show_email_public);

  const [accountName, setAccountName] = useState(payment?.account_name ?? "");
  const [bankName, setBankName] = useState(payment?.bank_name ?? "");
  const [accountNumber, setAccountNumber] = useState(payment?.account_number ?? "");
  const [bankCode, setBankCode] = useState(payment?.bank_code ?? "");
  const [accepted, setAccepted] = useState(business.setup_complete);

  const stepIndex = useMemo(
    () => SETUP_STEPS.findIndex((s) => s.key === step),
    [step],
  );

  async function uploadImage(file: File, kind: "logo" | "cover") {
    const supabase = createClient();
    const path = `${userId}/${business.id}/${kind}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("business-media")
      .upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("business-media").getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveProfile() {
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("business_profiles")
      .update({
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        service_zones: zones
          .split(",")
          .map((z) => z.trim())
          .filter(Boolean),
        campus_id: selectedCampus || null,
        logo_url: logoUrl,
        cover_url: coverUrl,
        setup_step: "hours",
      })
      .eq("id", business.id);
    if (updateError) throw updateError;
  }

  async function saveHours() {
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("business_profiles")
      .update({ hours, setup_step: "contact" })
      .eq("id", business.id);
    if (updateError) throw updateError;
  }

  async function saveContact() {
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("business_profiles")
      .update({
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
        email: email.trim() || null,
        show_phone_public: showPhone,
        show_whatsapp_public: showWhatsapp,
        show_email_public: showEmail,
        setup_step: "payment",
      })
      .eq("id", business.id);
    if (updateError) throw updateError;
  }

  async function savePayment() {
    const supabase = createClient();
    const { error: paymentError } = await supabase.from("business_payment_methods").upsert(
      {
        business_id: business.id,
        provider: "paystack",
        account_name: accountName.trim(),
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        bank_code: bankCode.trim() || null,
      },
      { onConflict: "business_id" },
    );
    if (paymentError) throw paymentError;

    const { error: updateError } = await supabase
      .from("business_profiles")
      .update({ setup_step: "review" })
      .eq("id", business.id);
    if (updateError) throw updateError;
  }

  async function completeSetup() {
    if (!accepted) {
      throw new Error("Accept the business rules to finish setup.");
    }
    if (!accountName.trim() || !bankName.trim() || !accountNumber.trim()) {
      throw new Error("Add payment details before finishing setup.");
    }
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("business_profiles")
      .update({
        setup_complete: true,
        setup_step: "review",
        policies_accepted_at: new Date().toISOString(),
      })
      .eq("id", business.id);
    if (updateError) throw updateError;
    setDone(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (step === "profile") {
        await saveProfile();
        setStep("hours");
      } else if (step === "hours") {
        await saveHours();
        setStep("contact");
      } else if (step === "contact") {
        await saveContact();
        setStep("payment");
      } else if (step === "payment") {
        await savePayment();
        setStep("review");
      } else {
        await completeSetup();
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this step.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <ol className="flex flex-wrap gap-2 text-sm">
        {SETUP_STEPS.map((item, index) => (
          <li
            key={item.key}
            className={`rounded-md border px-3 py-1.5 ${
              index === stepIndex
                ? "border-fg bg-fg text-inverse-fg"
                : index < stepIndex || done
                  ? "border-border bg-surface text-fg"
                  : "border-border text-muted"
            }`}
          >
            {index + 1}. {item.label}
          </li>
        ))}
      </ol>

      <form onSubmit={onSubmit} className="space-y-5">
        {step === "profile" ? (
          <>
            <Field label="Public business name">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </Field>
            <Field label="Search campus">
              <Input
                value={campusQuery}
                onChange={(e) => setCampusQuery(e.target.value)}
                placeholder="Campus name or city"
              />
            </Field>
            <Field label={`Campus (${filteredCampuses.length} shown)`}>
              <select
                className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm outline-none focus:border-fg"
                value={
                  filteredCampuses.some((c) => c.id === selectedCampus)
                    ? selectedCampus
                    : filteredCampuses[0]?.id || ""
                }
                onChange={(e) => setSelectedCampus(e.target.value)}
                required
              >
                {!filteredCampuses.length ? <option value="">No campuses match</option> : null}
                {filteredCampuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                    {campus.city ? ` · ${campus.city}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Service zones (comma-separated)">
              <Input value={zones} onChange={(e) => setZones(e.target.value)} />
            </Field>
            <Field label="Bio">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-fg"
              />
            </Field>
            <Field label="Logo image (optional)">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setLoading(true);
                  setError(null);
                  try {
                    const url = await uploadImage(file, "logo");
                    setLogoUrl(url);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Logo upload failed");
                  } finally {
                    setLoading(false);
                  }
                }}
              />
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo preview" className="mt-2 h-16 w-16 object-cover" />
              ) : null}
            </Field>
            <Field label="Cover image (optional)">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setLoading(true);
                  setError(null);
                  try {
                    const url = await uploadImage(file, "cover");
                    setCoverUrl(url);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Cover upload failed");
                  } finally {
                    setLoading(false);
                  }
                }}
              />
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl} alt="Cover preview" className="mt-2 h-24 w-full max-w-md object-cover" />
              ) : null}
            </Field>
          </>
        ) : null}

        {step === "hours" ? (
          <div className="space-y-3">
            {DAYS.map((day) => (
              <div
                key={day}
                className="grid grid-cols-1 items-center gap-2 border-b border-border py-3 sm:grid-cols-[8rem_auto_1fr_1fr]"
              >
                <p className="text-sm font-medium capitalize">{day}</p>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={hours[day].closed}
                    onChange={(e) =>
                      setHours((prev) => ({
                        ...prev,
                        [day]: { ...prev[day], closed: e.target.checked },
                      }))
                    }
                  />
                  Closed
                </label>
                <Input
                  type="time"
                  disabled={hours[day].closed}
                  value={hours[day].open}
                  onChange={(e) =>
                    setHours((prev) => ({
                      ...prev,
                      [day]: { ...prev[day], open: e.target.value },
                    }))
                  }
                />
                <Input
                  type="time"
                  disabled={hours[day].closed}
                  value={hours[day].close}
                  onChange={(e) =>
                    setHours((prev) => ({
                      ...prev,
                      [day]: { ...prev[day], close: e.target.value },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        ) : null}

        {step === "contact" ? (
          <>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showPhone}
                onChange={(e) => setShowPhone(e.target.checked)}
              />
              Show phone on public profile
            </label>
            <Field label="WhatsApp">
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showWhatsapp}
                onChange={(e) => setShowWhatsapp(e.target.checked)}
              />
              Show WhatsApp on public profile
            </label>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showEmail}
                onChange={(e) => setShowEmail(e.target.checked)}
              />
              Show email on public profile
            </label>
          </>
        ) : null}

        {step === "payment" ? (
          <>
            <p className="text-sm text-muted">
              Stored for payouts and subscriptions. Never shown on the student website.
            </p>
            <Field label="Account name">
              <Input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                required
              />
            </Field>
            <Field label="Bank name">
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                required
              />
            </Field>
            <Field label="Account number">
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                required
                inputMode="numeric"
              />
            </Field>
            <Field label="Bank code (optional)">
              <Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} />
            </Field>
          </>
        ) : null}

        {step === "review" ? (
          <div className="space-y-4">
            <div className="rounded-md border border-border p-4 text-sm">
              <p className="font-medium">{displayName}</p>
              <p className="mt-2 text-muted">{bio || "No bio yet"}</p>
              <p className="mt-2 text-muted">Zones: {zones || "—"}</p>
              <p className="mt-2 text-muted">
                Payment: {accountName ? `${accountName} · ${bankName}` : "Missing"}
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                disabled={done}
              />
              <span>
                I confirm my public details are accurate and I accept the{" "}
                <a href="/business-rules" className="underline underline-offset-2">
                  business rules
                </a>
                . I understand listings stay unpublished until setup is complete.
              </span>
            </label>
            {done ? (
              <div className="rounded-md border border-border bg-surface p-4 text-sm">
                <p className="font-medium text-success">Setup complete</p>
                <p className="mt-2 text-muted">
                  You can publish listings in the next phase. Public profile:
                </p>
                {business.slug ? (
                  <a
                    className="mt-2 inline-block underline underline-offset-2"
                    href={`${studentSiteUrl}/businesses/${business.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {studentSiteUrl}/businesses/{business.slug}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          {stepIndex > 0 && !done ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(SETUP_STEPS[stepIndex - 1].key)}
            >
              Back
            </Button>
          ) : null}
          {!done || step !== "review" ? (
            <Button type="submit" disabled={loading}>
              {loading
                ? "Saving…"
                : step === "review"
                  ? "Finish setup"
                  : "Save and continue"}
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => router.push("/dashboard")}>
              Back to dashboard
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
