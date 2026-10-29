"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isEmailAllowed } from "@/lib/env";
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
  next: z.string().optional(),
});

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const parsed = credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };
  if (!isEmailAllowed(parsed.data.email)) return { error: "This account is not authorized for this workspace.", email };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { error: "Email or password is incorrect.", email };
  redirect(safeNext(parsed.data.next));
}

export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const parsed = z.email().safeParse(email);
  if (!parsed.success) return { error: "Enter a valid email", email };
  if (!isEmailAllowed(parsed.data)) return { error: "This account is not authorized for this workspace.", email };
  const supabase = await createClient();
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    // never auto-create accounts from the login page: this is a private app
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: "Could not send a sign-in link. Check the email address.", email };
  return { info: "Check your inbox for a secure sign-in link.", email };
}
