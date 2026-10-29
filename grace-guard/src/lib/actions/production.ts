"use server";

import { applicationSchema, expenseSchema, formToObject, id as idSchema, transactionSchema } from "@/lib/validation/schemas";
import { dbError, fail, invalid, ok, requireUser, str } from "./helpers";
import type { ActionResult } from "./result";

async function remove(table: "applications" | "commission_transactions" | "expenses", form: FormData, label: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = idSchema.safeParse(str(form, "id"));
  if (!parsed.success) return fail("Invalid record.");
  const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq("id", parsed.data);
  if (error) return dbError(error);
  if (!count) return fail(`${label} not found.`);
  return ok(`${label} deleted.`);
}

export async function saveApplication(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = applicationSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...row } = parsed.data;
  const res = id ? await supabase.from("applications").update(row).eq("id", id) : await supabase.from("applications").insert(row);
  if (res.error) return dbError(res.error, "Another application already uses that reference.");
  return ok(id ? "Application updated." : "Application added. It itemizes the daily count for its date — it is not added on top.");
}

export async function deleteApplication(_prev: ActionResult, form: FormData) {
  return remove("applications", form, "Application");
}

export async function saveTransaction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = transactionSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...row } = parsed.data;
  const res = id ? await supabase.from("commission_transactions").update(row).eq("id", id) : await supabase.from("commission_transactions").insert(row);
  if (res.error) return dbError(res.error, "A transaction with that external ID already exists.");
  return ok("Commission transaction saved.");
}

export async function deleteTransaction(_prev: ActionResult, form: FormData) {
  return remove("commission_transactions", form, "Transaction");
}

export async function saveExpense(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = expenseSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...row } = parsed.data;
  const res = id ? await supabase.from("expenses").update(row).eq("id", id) : await supabase.from("expenses").insert(row);
  if (res.error) return dbError(res.error, "An expense with that external ID already exists.");
  return ok("Expense saved.");
}

export async function deleteExpense(_prev: ActionResult, form: FormData) {
  return remove("expenses", form, "Expense");
}
