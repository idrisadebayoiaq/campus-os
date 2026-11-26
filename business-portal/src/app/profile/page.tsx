import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";
import { Container, PageHeader } from "@/components/ui";
import { loadAccess } from "@/lib/access";
import { myBusinesses } from "@/lib/business";
import { isAdminOnly, isSupportOnly, PERSONA_LABEL } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My profile" };
export const instant = false;

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, access, businesses, { data: lecturer }, { data: blockers }] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name, preferred_name, full_name, phone, avatar_url").eq("id", user.id).maybeSingle(),
    loadAccess(supabase, user.id),
    myBusinesses(supabase, user.id),
    supabase.from("lecturer_profiles").select("staff_title").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("my_account_blockers"),
  ]);

  const minimal = isAdminOnly(access.personas) || isSupportOnly(access.personas);
  let first = profile?.first_name ?? "";
  let last = profile?.last_name ?? "";
  if (!first && !last && profile?.full_name) {
    const parts = String(profile.full_name).trim().split(/\s+/);
    first = parts[0] ?? "";
    last = parts.slice(1).join(" ");
  }

  return (
    <Container>
      <div className="space-y-8 py-8 sm:py-12">
        <PageHeader
          title="My profile"
          description={`${access.personas.map((p) => PERSONA_LABEL[p]).join(" · ")}. ${
            minimal ? "Keep your name, photo and password up to date." : "Your details, password and account."
          }`}
        />
        <ProfileForm
          profile={{
            userId: user.id,
            email: user.email ?? "",
            firstName: first,
            lastName: last,
            preferredName: profile?.preferred_name ?? "",
            phone: profile?.phone ?? "",
            avatarUrl: profile?.avatar_url ?? null,
          }}
          minimal={minimal}
          businesses={businesses.map((b) => ({ id: b.id, name: b.display_name, role: b.role }))}
          lecturerTitle={lecturer ? (lecturer.staff_title ?? "") : null}
          blockers={(blockers as string[] | null) ?? []}
        />
      </div>
    </Container>
  );
}
