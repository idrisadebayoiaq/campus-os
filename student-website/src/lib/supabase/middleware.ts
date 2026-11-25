import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Public marketing site + auth needed only for live sessions. */
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/privacy",
  "/terms",
  "/download",
];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return true;
  }
  // Static downloads
  if (pathname.startsWith("/downloads/")) return true;
  if (pathname.startsWith("/brand/")) return true;
  return false;
}

function isLivePath(pathname: string) {
  return pathname === "/live" || pathname.startsWith("/live/");
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  function redirectTo(path: string, withNext = false) {
    const url = request.nextUrl.clone();
    const [basePath, baseQuery = ""] = path.split("?");
    url.pathname = basePath || "/";
    url.search = baseQuery ? `?${baseQuery}` : "";
    if (withNext && path === "/login" && pathname !== "/") {
      url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    }
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value);
    });
    return response;
  }

  // Retired student-web app routes → landing
  const retiredPrefixes = [
    "/dashboard",
    "/signup",
    "/onboarding",
    "/housing",
    "/food",
    "/marketplace",
    "/businesses",
    "/guides",
    "/study",
    "/inbox",
    "/profile",
    "/school",
    "/settings",
    "/support",
  ];
  if (retiredPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return redirectTo("/");
  }

  if (!user) {
    if (isLivePath(pathname)) {
      return redirectTo("/login", true);
    }
    if (!isPublicPath(pathname) && !pathname.startsWith("/api/")) {
      return redirectTo("/");
    }
    return supabaseResponse;
  }

  if (pathname === "/login" || pathname === "/signup") {
    const next = request.nextUrl.searchParams.get("next");
    if (
      next &&
      next.startsWith("/") &&
      !next.startsWith("//") &&
      (next.startsWith("/live/") || next === "/live")
    ) {
      return redirectTo(next);
    }
    return redirectTo("/");
  }

  return supabaseResponse;
}
