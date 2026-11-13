import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

async function BusinessProfile({ slug }: { slug: string }) {
  const supabase = await createClient();

  // Intentionally omit payment fields — they live in business_payment_methods (owner/staff only).
  const { data: business } = await supabase
    .from("business_profiles")
    .select(
      "display_name, business_type, bio, phone, email, whatsapp, service_zones, hours, verification_label, setup_complete, logo_url, cover_url, show_phone_public, show_whatsapp_public, show_email_public, campuses(name, city)",
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!business) notFound();

  const campus = Array.isArray(business.campuses)
    ? business.campuses[0]
    : business.campuses;

  const hours =
    business.hours && typeof business.hours === "object"
      ? (business.hours as Record<
          string,
          { closed?: boolean; open?: string; close?: string }
        >)
      : null;

  return (
    <>
      {business.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={business.cover_url}
          alt=""
          className="h-40 w-full rounded-md object-cover"
        />
      ) : null}

      <div className="flex items-start gap-4">
        {business.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={business.logo_url}
            alt=""
            className="h-16 w-16 rounded-md border border-border object-cover"
          />
        ) : null}
        <PageHeader
          title={business.display_name}
          description="Public profile."
        />
      </div>

      <div className="space-y-4 rounded-md border border-border p-5 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Type</p>
          <p className="mt-1 capitalize">
            {business.business_type.replaceAll("_", " ")}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Verification</p>
          <p className="mt-1 capitalize">
            {business.verification_label.replaceAll("_", " ")}
          </p>
        </div>
        {campus ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Campus</p>
            <p className="mt-1">
              {campus.name}
              {campus.city ? ` · ${campus.city}` : ""}
            </p>
          </div>
        ) : null}
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">About</p>
          <p className="mt-1 text-muted">{business.bio || "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Zones</p>
          <p className="mt-1 text-muted">
            {(business.service_zones || []).join(", ") || "—"}
          </p>
        </div>

        {hours ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Hours</p>
            <ul className="mt-2 space-y-1 text-muted">
              {DAYS.map((day) => {
                const entry = hours[day];
                if (!entry) return null;
                return (
                  <li key={day} className="flex justify-between gap-4 capitalize">
                    <span>{day}</span>
                    <span>
                      {entry.closed
                        ? "Closed"
                        : `${entry.open ?? "—"} – ${entry.close ?? "—"}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {(business.show_phone_public ||
          business.show_whatsapp_public ||
          business.show_email_public) && (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Contact</p>
            <div className="mt-2 space-y-1 text-muted">
              {business.show_phone_public && business.phone ? (
                <p>Phone: {business.phone}</p>
              ) : null}
              {business.show_whatsapp_public && business.whatsapp ? (
                <p>WhatsApp: {business.whatsapp}</p>
              ) : null}
              {business.show_email_public && business.email ? (
                <p>Email: {business.email}</p>
              ) : null}
            </div>
          </div>
        )}

        {!business.setup_complete ? (
          <p className="text-muted">
            This business is approved but still completing setup. Listings appear
            after setup is finished.
          </p>
        ) : null}
      </div>
    </>
  );
}

async function BusinessProfileFromParams({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <BusinessProfile slug={slug} />;
}

export default function PublicBusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <Suspense
          fallback={
            <div className="rounded-md border border-border bg-surface p-5 text-sm text-muted">
              Loading business profile…
            </div>
          }
        >
          <BusinessProfileFromParams params={params} />
        </Suspense>
      </div>
    </Container>
  );
}
