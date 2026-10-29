import type { FieldErrors } from "@/lib/validation/schemas";

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: FieldErrors;
  warnings?: string[];
  /** bumps on every submission so clients can react to repeated identical results */
  at?: number;
}

export const initialActionResult: ActionResult = { ok: false, message: "" };
