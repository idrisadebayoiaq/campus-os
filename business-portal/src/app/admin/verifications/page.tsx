import { redirect } from "next/navigation";
import { VerificationQueue, type VerificationItem } from "@/components/admin-trust-queues";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "CAC verification" };
export const instant = false;

export default async function AdminVerificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) redirect("/dashboard");

  const { data: rows } = await supabase
    .from("verification_requests")
    .select("id, cac_number, document_path, created_at, business_profiles(display_name)")
    .eq("status", "pending")
    .order("created_at");

  const items: VerificationItem[] = await Promise.all(
    (rows ?? []).map(async (r) => {
      const { data: signed } = await supabase.storage.from("application-docs").createSignedUrl(r.document_path, 3600);
      const biz = Array.isArray(r.business_profiles) ? r.business_profiles[0] : r.business_profiles;
      return {
        id: r.id,
        business: (biz as { display_name?: string } | null)?.display_name ?? "Business",
        cac_number: r.cac_number,
        created_at: r.created_at,
        document_url: signed?.signedUrl ?? null,
      };
    }),
  );

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader title="CAC verification" description="Check the certificate against the registered name and number, then approve the badge." />
        {items.length ? <VerificationQueue items={items} /> : <EmptyState title="Nothing waiting" description="New CAC requests appear here." />}
      </div>
    </Container>
  );
}
