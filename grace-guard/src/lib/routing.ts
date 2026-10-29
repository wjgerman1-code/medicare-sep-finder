/**
 * Pure routing rules for the authentication gate and the canonical domain.
 * Kept free of Next.js imports so they can be unit-tested.
 */

/** Routes reachable without a session. Everything else requires sign-in. */
export const PUBLIC_PATHS = ["/login", "/auth", "/setup"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only same-site relative paths may be used as a post-login destination. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (isPublicPath(next.split("?")[0])) return "/";
  return next;
}

function isLocalHost(host: string): boolean {
  const name = host.split(":")[0];
  return name === "localhost" || name === "127.0.0.1" || name === "::1" || name.endsWith(".localhost");
}

/**
 * When enforcement is on, any request on a different host (for example the
 * project's *.vercel.app address) is permanently redirected to the canonical
 * domain, preserving path and query. Local development is never redirected.
 */
export function canonicalRedirect(
  host: string | null,
  url: { pathname: string; search: string },
  opts: { enforce: boolean; canonicalHost: string },
): string | null {
  if (!opts.enforce || !host) return null;
  const h = host.toLowerCase();
  if (h === opts.canonicalHost.toLowerCase() || isLocalHost(h)) return null;
  return `https://${opts.canonicalHost}${url.pathname}${url.search}`;
}

/** Cookie remembering whether the user chose "Keep me signed in". */
export const PERSIST_COOKIE = "gg_persist";

export interface CookieOptionsLike {
  maxAge?: number;
  expires?: Date;
  [key: string]: unknown;
}

/**
 * Without "Keep me signed in", Supabase auth cookies become browser-session
 * cookies (no Max-Age/Expires): closing the browser ends the session.
 */
export function applySessionPersistence<T extends CookieOptionsLike>(options: T | undefined, persist: boolean): T | undefined {
  if (persist || !options) return options;
  const { maxAge: _maxAge, expires: _expires, ...rest } = options;
  void _maxAge;
  void _expires;
  return rest as T;
}
