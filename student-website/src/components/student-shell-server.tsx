import { connection } from "next/server";
import { StudentShell } from "@/components/student-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { displayNameFromProfile, usernameFromEmail } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export async function StudentShellServer({ children }: { children: React.ReactNode }) {
  // Auth session expiry checks use Date.now() — must be request-time with Cache Components.
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let shellUser = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, first_name, preferred_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

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
    };
  }

  return (
    <ThemeProvider>
      <StudentShell user={shellUser}>{children}</StudentShell>
    </ThemeProvider>
  );
}

/** Static chrome only — do not pass page children into Suspense fallbacks. */
export function StudentShellFallback() {
  return (
    <ThemeProvider>
      <StudentShell user={null}>
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted">Loading…</div>
      </StudentShell>
    </ThemeProvider>
  );
}
