import { notFound, redirect } from "next/navigation";
import { AdminApplicationActions } from "@/components/admin-application-actions";
import { Container, PageHeader } from "@/components/ui";
import { businessTypeLabel } from "@/lib/business-types";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AdminApplicationDetailPage({
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

  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) redirect("/admin/applications");

  const { data: app } = await supabase
    .from("business_applications")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!app) notFound();

  const { data: docs } = await supabase
    .from("application_documents")
    .select("id, doc_type, file_name, storage_path, created_at")
    .eq("application_id", id)
    .order("created_at", { ascending: false });

  return (
    <Container>
      <div className="mx-auto max-w-3xl space-y-8 py-12">
        <PageHeader
          title={app.business_name}
          description={`${businessTypeLabel(app.business_type)} · ${app.status}`}
        />

        <div className="grid gap-4 rounded-md border border-border p-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Owner</p>
            <p className="mt-1">{app.owner_full_name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Contact</p>
            <p className="mt-1">
              {app.phone}
              <br />
              {app.email}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted">Description</p>
            <p className="mt-1 text-muted">{app.description || "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted">Zones</p>
            <p className="mt-1 text-muted">
              {(app.service_zones || []).join(", ") || "—"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted">Address</p>
            <p className="mt-1 text-muted">{app.address_text || "—"}</p>
          </div>
          {app.decision_reason ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted">Last decision reason</p>
              <p className="mt-1 text-muted">{app.decision_reason}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-medium">Documents</h2>
          {!docs?.length ? (
            <p className="text-sm text-muted">No documents uploaded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {docs.map((doc) => (
                <li key={doc.id} className="rounded-md border border-border px-3 py-2">
                  <span className="font-medium">{doc.doc_type}</span>
                  <span className="text-muted"> · {doc.file_name}</span>
                  <span className="block text-xs text-muted">{doc.storage_path}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">
            Private storage paths are listed for staff. Download via Supabase Storage
            dashboard or signed URLs in a later hardening pass.
          </p>
        </div>

        <AdminApplicationActions applicationId={app.id} />
      </div>
    </Container>
  );
}
