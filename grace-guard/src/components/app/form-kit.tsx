"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ACTIONS, type ActionName } from "@/lib/actions/registry";
import { initialActionResult, type ActionResult } from "@/lib/actions/result";
import { cn } from "@/lib/utils";

export type ServerAction = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/**
 * useActionState + toast notifications for success, errors and warnings.
 * After a successful mutation the current route is refreshed so every number
 * on screen is recalculated from the database.
 */
export function useActionToast(action: ServerAction, onSuccess?: () => void) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialActionResult);
  useEffect(() => {
    if (!state.at) return;
    if (state.ok) {
      toast.success(state.message);
      state.warnings?.forEach((w) => toast.warning(w, { duration: 8000 }));
      onSuccess?.();
      router.refresh();
    } else if (state.message) {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);
  return { state, formAction, pending };
}

export function SubmitButton({ children, pendingText = "Saving…", ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" /> {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive" id={`${name}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Small inline form posting `id` to a delete action, behind a confirmation dialog. */
export function ConfirmDelete({ action, id, what, size = "icon" }: { action: ActionName; id: string; what: string; size?: "icon" | "sm" }) {
  const [open, setOpen] = useState(false);
  const { formAction } = useActionToast(ACTIONS[action], () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size={size} aria-label={`Delete ${what}`} className="text-muted-foreground hover:text-destructive">
          <Trash2 />
          {size === "sm" && "Delete"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {what}?</DialogTitle>
          <DialogDescription>This cannot be undone. The change is recorded in the audit log and dashboards update immediately.</DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="id" value={id} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingText="Deleting…">
              Delete
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
