import { notFound, redirect } from "next/navigation";
import { ApplicationForm } from "@/components/application-form";
import { Container, PageHeader } from "@/components/ui";
import { businessTypeLabel, isBusinessType } from "@/lib/business-types";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function ApplyTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!isBusinessType(type)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/apply/${type}`);
  }

  const { data: campuses } = await supabase
    .from("campuses")
    .select("id, name, city, state, institutions(name, short_name)")
    .eq("is_active", true)
    .order("name");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <PageHeader
          title={`Apply · ${businessTypeLabel(type)}`}
          description="Submit your details for admin review. You cannot publish listings until approved."
        />
        <ApplicationForm
          businessType={type}
          campuses={campuses ?? []}
          defaults={{
            owner_full_name: profile?.full_name ?? "",
            phone: profile?.phone ?? "",
            email: user.email ?? "",
          }}
        />
      </div>
    </Container>
  );
}
