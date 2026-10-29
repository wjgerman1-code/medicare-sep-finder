"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Field, SubmitButton, useActionToast } from "@/components/app/form-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ACTIONS, type ActionName } from "@/lib/actions/registry";
import { cn } from "@/lib/utils";

export type FieldType = "text" | "number" | "date" | "money" | "percent" | "select" | "textarea" | "checkbox" | "checkboxes" | "file";

/** Serializable field config so server pages can describe forms for this client component. */
export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  defaultValue?: string | number | boolean | null | string[];
  options?: Array<{ value: string; label: string }>;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  accept?: string;
  wide?: boolean;
}

export interface SimpleFormProps {
  action: ActionName;
  fields: FieldConfig[];
  hidden?: Record<string, string | null | undefined>;
  submitLabel: string;
  /** when editing, navigate here after success / on cancel */
  cancelHref?: string;
  columns?: 1 | 2 | 3 | 4;
  resetOnSuccess?: boolean;
  className?: string;
}

const COLS = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };

export function SimpleForm({ action, fields, hidden = {}, submitLabel, cancelHref, columns = 2, resetOnSuccess = true, className }: SimpleFormProps) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const { state, formAction } = useActionToast(ACTIONS[action], () => {
    if (cancelHref) router.replace(cancelHref);
    else if (resetOnSuccess) ref.current?.reset();
  });
  const errors = state.ok ? {} : state.fieldErrors ?? {};

  // an edit form (has a cancel target) scrolls itself into view when opened
  useEffect(() => {
    if (cancelHref) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [cancelHref]);

  return (
    <form ref={ref} action={formAction} className={cn("flex flex-col gap-4", className)}>
      {Object.entries(hidden).map(([k, v]) => (v === null || v === undefined ? null : <input key={k} type="hidden" name={k} value={v} />))}
      <div className={cn("grid gap-4", COLS[columns])}>
        {fields.map((f) => (
          <Field key={f.name} label={f.label} name={f.name} error={errors[f.name] ?? errors[f.name.replace(/_cents$/, "")]} hint={f.hint} className={f.wide ? "sm:col-span-full" : undefined}>
            {renderInput(f, !!errors[f.name])}
          </Field>
        ))}
      </div>
      {errors._form && <p className="text-sm text-destructive">{errors._form}</p>}
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="gold">{submitLabel}</SubmitButton>
        {cancelHref && (
          <Button asChild variant="outline">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        )}
      </div>
    </form>
  );
}

function renderInput(f: FieldConfig, invalid: boolean) {
  const common = { id: f.name, name: f.name, required: f.required, "aria-invalid": invalid || undefined };
  const dv = f.defaultValue === null || f.defaultValue === undefined ? undefined : f.defaultValue;
  switch (f.type) {
    case "select":
      return (
        <Select {...common} defaultValue={dv === undefined ? "" : String(dv)}>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case "textarea":
      return <Textarea {...common} rows={2} defaultValue={dv === undefined ? undefined : String(dv)} placeholder={f.placeholder} />;
    case "checkbox":
      return (
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" name={f.name} id={f.name} defaultChecked={!!dv} className="h-4 w-4 accent-[#101C2E]" /> {f.placeholder ?? "Yes"}
        </label>
      );
    case "checkboxes": {
      const selected = new Set(Array.isArray(dv) ? dv.map(String) : []);
      return (
        <div className="flex flex-wrap gap-2">
          {f.options?.map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-sm has-[:checked]:border-gold has-[:checked]:bg-gold/10">
              <input type="checkbox" name={f.name} value={o.value} defaultChecked={selected.has(o.value)} className="h-3.5 w-3.5 accent-[#101C2E]" />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case "file":
      return <Input {...common} type="file" accept={f.accept} className="pt-1.5" />;
    case "money":
      return <Input {...common} inputMode="decimal" placeholder={f.placeholder ?? "0.00"} defaultValue={dv === undefined ? undefined : String(dv)} />;
    case "percent":
      return <Input {...common} inputMode="decimal" placeholder={f.placeholder ?? "e.g. 20"} defaultValue={dv === undefined ? undefined : String(dv)} />;
    case "number":
      return <Input {...common} type="number" inputMode="numeric" min={f.min ?? 0} max={f.max} step="any" placeholder={f.placeholder} defaultValue={dv === undefined ? undefined : String(dv)} />;
    case "date":
      return <Input {...common} type="date" min={f.min} max={f.max} defaultValue={dv === undefined ? undefined : String(dv)} />;
    default:
      return <Input {...common} type="text" placeholder={f.placeholder} defaultValue={dv === undefined ? undefined : String(dv)} />;
  }
}
