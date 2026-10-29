"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSiteUrl, isEmailAllowed } from "@/lib/env";
import { PERSIST_COOKIE, safeNextPath } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
  info?: string;
  /** echoed back so the field survives React's post-action form reset */
  email?: string;
}

const credentials = z.object({
  email: z.email({ error: "Enter a valid email" }),
  password: z.string().min(1, { error: "Enter your password" }),
});

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Remember the "Keep me signed in" choice; without it auth cookies end with the browser session. */
async function rememberChoice(persist: boolean) {
  const store = await cookies();
  store.set(PERSIST_COOKIE, persist ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(persist ? { maxAge: ONE_YEAR } : {}),
  });
}

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const persist = form.get("remember") === "on";
  const parsed = credentials.safeParse({ email, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };
  if (!isEmailAllowed(parsed.data.email)) return { error: "This account is not authorized for this portal.", email };

  await rememberChoice(persist);
  const supabase = await createClient({ persistSession: persist });
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // one generic message: never reveal whether the email exists
  if (error) return { error: "Email or password is incorrect.", email };
  redirect(safeNextPath(String(form.get("next") ?? "")));
}

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const parsed = z.email().safeParse(email);
  if (!parsed.success) return { error: "Enter a valid email", email };
  if (!isEmailAllowed(parsed.data)) return { error: "This account is not authorized for this portal.", email };
  await rememberChoice(form.get("remember") === "on");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    // private portal: never create accounts from the login page
    options: { shouldCreateUser: false, emailRedirectTo: `${getSiteUrl()}/auth/callback` },
  });
  if (error) return { error: "Could not send a sign-in link. Check the email address.", email };
  return { info: "Check your inbox for a secure sign-in link.", email };
}
