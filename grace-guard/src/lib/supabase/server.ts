import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/env";
import { applySessionPersistence, PERSIST_COOKIE } from "@/lib/routing";

/**
 * Per-request Supabase client acting as the signed-in user (RLS enforced).
 * `persistSession` overrides the remembered "Keep me signed in" choice (used
 * at sign-in, before the preference cookie exists).
 */
export async function createClient(opts: { persistSession?: boolean } = {}) {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase environment variables are not configured");
  const cookieStore = await cookies();
  const persist = opts.persistSession ?? cookieStore.get(PERSIST_COOKIE)?.value !== "0";
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, applySessionPersistence(options, persist));
        } catch {
          // called from a Server Component; the proxy refreshes the session instead
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
