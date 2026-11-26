import { connection } from "next/server";
import { PortalShell } from "@/components/portal-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { displayNameFromProfile, usernameFromEmail } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export async function PortalShellServer({ children }: { children: React.ReactNode }) {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let shellUser = null;
  if (user) {
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, first_name, preferred_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);

    const displayName = displayNameFromProfile({
      preferred_name: profile?.preferred_name,
      first_name: profile?.first_name,
      full_name: profile?.full_name,
      email: user.email,
    });

    shellUser = {
      id: user.id,
      email: user.email ?? null,
      displayName,
      username: usernameFromEmail(user.email),
      avatarUrl: profile?.avatar_url ?? null,
      roles: (roleRows ?? []).map((row) => String(row.role)),
    };
  }

  return (
    <ThemeProvider>
      <PortalShell user={shellUser}>{children}</PortalShell>
    </ThemeProvider>
  );
}

export function PortalShellFallback({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PortalShell user={null}>{children}</PortalShell>
    </ThemeProvider>
  );
}
