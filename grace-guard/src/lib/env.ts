export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/** Returns null (instead of throwing) so the app can render setup instructions. */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url.includes("YOUR-PROJECT")) return null;
  return { url, anonKey };
}

/** Optional private-app allowlist (comma-separated emails). Empty = any account in the project. */
export function isEmailAllowed(email: string | null | undefined): boolean {
  const list = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  return !!email && list.includes(email.toLowerCase());
}

export const BRAND = {
  name: "Grace & Guard",
  descriptor: "Life & Health Solutions",
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL || null,
};
