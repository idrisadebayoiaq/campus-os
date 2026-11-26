import { redirect } from "next/navigation";
import { AdminUserManager, type AdminUserRow } from "@/components/admin-user-manager";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Users & roles" };
export const instant = false;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/users");

  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) {
    return (
      <Container>
        <div className="py-12">
          <EmptyState title="Staff only" description="Admin or moderator role required." />
        </div>
      </Container>
    );
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const isAdmin = (roleRows ?? []).some((r) => r.role === "admin");

  const { data: users } = await supabase.rpc("admin_list_users", { search: q ?? null });

  return (
    <Container className="space-y-6 py-8">
      <PageHeader
        title="Users & roles"
        description={
          isAdmin
            ? "Search accounts and grant or revoke roles. Changes apply immediately."
            : "Moderators can view accounts. Only admins can change roles."
        }
      />
      <form className="flex gap-2" action="/admin/users">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by email or name"
          className="h-11 w-full rounded-full border border-border bg-bg px-4 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          className="h-11 shrink-0 rounded-full bg-accent px-6 text-sm font-semibold text-on-accent"
        >
          Search
        </button>
      </form>
      {!users?.length ? (
        <EmptyState title="No users found" description="Try a different search." />
      ) : (
        <AdminUserManager
          users={users as AdminUserRow[]}
          currentUserId={user.id}
          canManage={isAdmin}
        />
      )}
    </Container>
  );
}
