import Link from "next/link";
import { redirect } from "next/navigation";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { businessTypeLabel } from "@/lib/business-types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Applications" };
export const instant = false;

export default async function AdminApplicationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/applications");

  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) {
    return (
      <Container>
        <div className="space-y-6 py-12">
          <PageHeader
            title="Applications"
            description="Staff access required."
          />
          <EmptyState
            title="Not authorized"
            description="Your account needs an admin or moderator role to review applications."
          />
        </div>
      </Container>
    );
  }

  const { data: apps } = await supabase
    .from("business_applications")
    .select("id, business_name, business_type, status, submitted_at, created_at")
    .order("created_at", { ascending: false });

  return (
    <Container>
      <div className="space-y-8 py-12">
        <PageHeader
          title="Business applications"
          description="Review submitted applications, then approve, reject, or request changes."
        />

        {!apps?.length ? (
          <EmptyState
            title="No applications yet"
            description="When businesses submit from /apply, they appear here."
          />
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {apps.map((app) => (
              <Link
                key={app.id}
                href={`/admin/applications/${app.id}`}
                className="flex flex-col gap-1 px-4 py-4 hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{app.business_name}</p>
                  <p className="text-sm text-muted">
                    {businessTypeLabel(app.business_type)}
                  </p>
                </div>
                <div className="text-sm text-muted">
                  <span className="text-fg">{app.status}</span>
                  {app.submitted_at
                    ? ` · ${new Date(app.submitted_at).toLocaleDateString()}`
                    : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
