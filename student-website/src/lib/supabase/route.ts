import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

function bearerFrom(request: Request) {
  const auth = request.headers.get("authorization") || "";
  return auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

/**
 * API-route client that accepts either cookie session (website)
 * or Authorization: Bearer <access_token> (Expo app).
 */
export async function createRouteClient(request: Request) {
  await connection();
  const bearer = bearerFrom(request);

  if (bearer) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${bearer}` },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* Server Component cookie write — ignore */
          }
        },
      },
    },
  );
}

/**
 * Resolve the authenticated user for cookie OR Bearer sessions.
 * Mobile clients with persistSession:false need getUser(jwt) explicitly.
 */
export async function getRouteUser(
  request: Request,
  supabase: SupabaseClient,
): Promise<{ user: User | null; error: Error | null }> {
  const bearer = bearerFrom(request);
  if (bearer) {
    const { data, error } = await supabase.auth.getUser(bearer);
    return { user: data.user ?? null, error: error as Error | null };
  }
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user ?? null, error: error as Error | null };
}
