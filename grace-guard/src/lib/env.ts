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

/** Production URL of the portal. All auth redirects and canonical links use it. */
export const DEFAULT_SITE_URL = "https://portal.gracenguard.com";

export function getSiteUrl(): string {
  // SITE_URL is read at runtime on the server; NEXT_PUBLIC_SITE_URL is fixed at build time
  return (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

export function getCanonicalHost(): string {
  return new URL(getSiteUrl()).host;
}

/** Redirect other hostnames (e.g. *.vercel.app) to the canonical domain. Enable in production only. */
export function shouldEnforceCanonicalHost(): boolean {
  return process.env.ENFORCE_CANONICAL_HOST === "true";
}

export const BRAND = {
  name: "Grace & Guard",
  descriptor: "Life & Health Solutions",
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL || null,
  tagline: "Grace in how you're treated. Guard in what you keep.",
};
