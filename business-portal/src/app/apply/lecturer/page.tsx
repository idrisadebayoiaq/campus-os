import { redirect } from "next/navigation";
import { LecturerApplicationForm } from "@/components/lecturer-application-form";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Lecturer application" };
export const instant = false;

export default async function LecturerApplyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/apply/lecturer");

  const [{ data: profile }, { data: lecturer }, { data: apps }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, preferred_name, first_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("lecturer_profiles")
      .select("status, school_email, institution_id, staff_title")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("lecturer_applications")
      .select("id, status, school_email, review_note, created_at, institutions(name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const displayName =
    profile?.preferred_name || profile?.full_name || profile?.first_name || "";

  return (
    <Container>
      <div className="mx-auto max-w-2xl space-y-8 py-10">
        <PageHeader
          title="Lecturer application"
          description="Your school must already be registered. Use a school email on an allowed domain, then wait for school authority approval."
        />

        {lecturer ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-4 text-sm">
            <p className="font-medium capitalize">Status: {lecturer.status}</p>
            <p className="mt-1 text-muted">School email: {lecturer.school_email}</p>
            {lecturer.status === "approved" ? (
              <div className="mt-3">
                <ButtonLink href="/classes">Go to classes</ButtonLink>
              </div>
            ) : null}
            {lecturer.status === "pending" ? (
              <p className="mt-2 text-muted">
                School authority will review your application. You cannot manage classes until approved.
              </p>
            ) : null}
          </div>
        ) : null}

        {apps?.length ? (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Recent submissions</h2>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {apps.map((app) => {
                const inst = Array.isArray(app.institutions)
                  ? app.institutions[0]
                  : app.institutions;
                return (
                  <li key={app.id} className="px-4 py-3 text-sm">
                    <p className="font-medium">
                      {(inst as { name?: string } | null)?.name || "School"} ·{" "}
                      <span className="capitalize">{app.status}</span>
                    </p>
                    <p className="text-muted">{app.school_email}</p>
                    {app.review_note ? (
                      <p className="mt-1 text-muted">Note: {app.review_note}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {!lecturer || lecturer.status === "rejected" || lecturer.status === "pending" ? (
          <LecturerApplicationForm
            defaultPersonalEmail={user.email}
            defaultFullName={displayName}
          />
        ) : null}
      </div>
    </Container>
  );
}
