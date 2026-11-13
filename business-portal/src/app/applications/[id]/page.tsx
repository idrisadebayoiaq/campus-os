import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { businessTypeLabel } from "@/lib/business-types";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

const statusCopy: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted — waiting for review",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  needs_changes: "Needs changes",
};

export default async function ApplicationStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: app } = await supabase
    .from("business_applications")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!app) notFound();
  if (app.user_id !== user.id) {
    const { data: isStaff } = await supabase.rpc("is_staff");
    if (!isStaff) notFound();
  }

  const { data: business } = await supabase
    .from("business_profiles")
    .select("id, setup_complete, slug")
    .eq("application_id", id)
    .maybeSingle();

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-12">
        <PageHeader
          title={app.business_name}
          description={`${businessTypeLabel(app.business_type)} application`}
        />

        <div className="space-y-4 rounded-md border border-border p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Status</p>
            <p className="mt-1 font-medium">{statusCopy[app.status] ?? app.status}</p>
          </div>
          {app.decision_reason ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Admin note</p>
              <p className="mt-1 text-sm text-muted">{app.decision_reason}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Submitted</p>
            <p className="mt-1 text-sm text-muted">
              {app.submitted_at
                ? new Date(app.submitted_at).toLocaleString()
                : "—"}
            </p>
          </div>
        </div>

        {app.status === "approved" && business ? (
          <div className="space-y-3">
            <p className="text-sm text-success">
              Approved. Complete setup before you can publish listings.
            </p>
            <ButtonLink href={`/setup/${business.id}`}>
              {business.setup_complete ? "Review setup" : "Start setup wizard"}
            </ButtonLink>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Admin will approve, reject, or request changes. Updates appear on this
            page.
          </p>
        )}

        <Link href="/dashboard" className="text-sm underline underline-offset-2">
          Back to dashboard
        </Link>
      </div>
    </Container>
  );
}
