import "server-only";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { flattenErrors } from "@/lib/validation/schemas";
import type { ActionResult } from "./result";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return { supabase, user };
}

/**
 * Success result. Pages are dynamic (rendered per request), so the client
 * refreshes the current route after a successful save (see useActionToast)
 * rather than streaming a revalidated tree inside the action response.
 */
export function ok(message: string, warnings?: string[]): ActionResult {
  return { ok: true, message, warnings, at: Date.now() };
}

export function fail(message: string, fieldErrors?: ActionResult["fieldErrors"]): ActionResult {
  return { ok: false, message, fieldErrors, at: Date.now() };
}

export function invalid(error: z.ZodError): ActionResult {
  return fail("Please fix the highlighted fields.", flattenErrors(error));
}

/** Map Postgres errors to friendly messages without leaking internals. */
export function dbError(error: { code?: string; message: string }, duplicateMessage = "That record already exists."): ActionResult {
  switch (error.code) {
    case "23505":
      return fail(duplicateMessage);
    case "23503":
      return fail("This record is referenced by other data (or references something that no longer exists).");
    case "23514":
      return fail("A value breaks a data rule (for example a negative number or an impossible combination).");
    case "23P01":
      return fail(error.message);
    case "42501":
      return fail("You don't have access to that record.");
    default:
      console.error("database error", error);
      return fail("Something went wrong saving to the database. Please try again.");
  }
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}
