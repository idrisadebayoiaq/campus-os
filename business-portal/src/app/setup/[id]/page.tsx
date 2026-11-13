import { notFound, redirect } from "next/navigation";
import { SetupWizard } from "@/components/setup-wizard";
import { Container, PageHeader } from "@/components/ui";
import { businessTypeLabel } from "@/lib/business-types";
import { defaultHours, type HoursMap } from "@/lib/setup";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Business setup" };
export const instant = false;

export default async function SetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/setup/${id}`);

  const { data: business } = await supabase
    .from("business_profiles")
    .select(
      "id, display_name, bio, phone, email, whatsapp, service_zones, logo_url, cover_url, hours, show_phone_public, show_whatsapp_public, show_email_public, setup_complete, setup_step, slug, campus_id, business_type, owner_user_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!business) notFound();
  if (business.owner_user_id !== user.id) {
    const { data: isStaff } = await supabase.rpc("is_staff");
    if (!isStaff) notFound();
  }

  const { data: payment } = await supabase
    .from("business_payment_methods")
    .select("account_name, bank_name, account_number, bank_code")
    .eq("business_id", id)
    .maybeSingle();

  const { data: campuses } = await supabase
    .from("campuses")
    .select("id, name, city")
    .eq("is_active", true)
    .order("name");

  const hours =
    business.hours && typeof business.hours === "object"
      ? ({ ...defaultHours(), ...(business.hours as HoursMap) } as HoursMap)
      : defaultHours();

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <PageHeader
          title={`Setup · ${business.display_name}`}
          description={`${businessTypeLabel(business.business_type)} — complete all steps before publishing listings.`}
        />
        <SetupWizard
          business={{
            ...business,
            hours,
          }}
          payment={payment}
          campuses={campuses ?? []}
          campusId={business.campus_id}
          userId={user.id}
          studentSiteUrl={
            process.env.NEXT_PUBLIC_STUDENT_URL || "http://localhost:3000"
          }
        />
      </div>
    </Container>
  );
}
