"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, signIn, type LoginState } from "./actions";

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [pwState, pwAction, pwPending] = useActionState<LoginState, FormData>(signIn, {});
  const [mlState, mlAction, mlPending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  const state = mode === "password" ? pwState : mlState;
  const pending = pwPending || mlPending;

  return (
    <form action={mode === "password" ? pwAction : mlAction} className="flex flex-col gap-4">
      {error === "not_allowed" && (
        <Alert variant="destructive">
          <AlertDescription>That account is not authorized for this workspace.</AlertDescription>
        </Alert>
      )}
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.info && (
        <Alert variant="success">
          <AlertDescription>{state.info}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="next" value={next ?? "/"} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} key={state.email} />
      </div>
      {mode === "password" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
      )}
      <Button type="submit" variant="gold" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </Button>
      <button type="button" onClick={() => setMode(mode === "password" ? "magic" : "password")} className="text-sm text-gold-deep underline-offset-4 hover:underline">
        {mode === "password" ? "Use a one-time email link instead" : "Use my password instead"}
      </button>
    </form>
  );
}
