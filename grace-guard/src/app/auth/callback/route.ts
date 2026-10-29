import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";

/** Completes magic-link / email-confirmation sign-in (PKCE code exchange). */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const dest = safeNextPath(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(dest, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
