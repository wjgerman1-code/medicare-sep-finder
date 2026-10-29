import { NextResponse, type NextRequest } from "next/server";
import { PERSIST_COOKIE } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";

/** Ends the Supabase session, clears auth + preference cookies, returns to the login screen. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const response = NextResponse.redirect(new URL("/login?signed_out=1", request.url), { status: 303 });
  // belt and braces: expire any remaining Supabase auth cookies
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-") || c.name === PERSIST_COOKIE) response.cookies.set(c.name, "", { path: "/", maxAge: 0 });
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
