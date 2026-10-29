import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCanonicalHost, getSupabaseEnv, isEmailAllowed, shouldEnforceCanonicalHost } from "@/lib/env";
import { applySessionPersistence, canonicalRedirect, isPublicPath, PERSIST_COOKIE } from "@/lib/routing";

/** Responses for signed-in pages must never be cached or indexed. */
function protect(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

/**
 * Authentication gate, run on every request (src/proxy.ts):
 * 1. canonical-domain redirect (portal.gracenguard.com) when enforced;
 * 2. Supabase session refresh, honouring "Keep me signed in";
 * 3. no valid session → /login for every non-public route;
 * 4. optional email allowlist; signed-in users skip the login page.
 */
export async function updateSession(request: NextRequest) {
  const redirectTo = canonicalRedirect(request.headers.get("host"), request.nextUrl, {
    enforce: shouldEnforceCanonicalHost(),
    canonicalHost: getCanonicalHost(),
  });
  if (redirectTo) return NextResponse.redirect(redirectTo, 308);

  const env = getSupabaseEnv();
  const path = request.nextUrl.pathname;
  const isPublic = isPublicPath(path);

  if (!env) {
    if (path === "/setup") return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const persist = request.cookies.get(PERSIST_COOKIE)?.value !== "0";
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, applySessionPersistence(options, persist));
      },
    },
  });

  // validates the JWT with Supabase Auth (never trust getSession() here)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const url = new URL("/login", request.url);
    if (path !== "/") url.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return protect(NextResponse.redirect(url));
  }
  if (user && !isEmailAllowed(user.email) && path !== "/login") {
    await supabase.auth.signOut();
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "not_allowed");
    return protect(NextResponse.redirect(url));
  }
  if (user && path === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return isPublic ? response : protect(response);
}
