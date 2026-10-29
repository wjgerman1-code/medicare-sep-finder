"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMagicLink, signIn, type LoginState } from "./actions";

const MESSAGES: Record<string, { variant: "destructive" | "success" | "info"; text: string }> = {
  not_allowed: { variant: "destructive", text: "That account is not authorized for this portal." },
  link: { variant: "destructive", text: "That sign-in link is invalid or has expired. Please sign in again." },
};

export function LoginForm({ next, error, signedOut }: { next?: string; error?: string; signedOut?: boolean }) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [showPassword, setShowPassword] = useState(false);
  const [pwState, pwAction, pwPending] = useActionState<LoginState, FormData>(signIn, {});
  const [mlState, mlAction, mlPending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  const state = mode === "password" ? pwState : mlState;
  const pending = pwPending || mlPending;
  const notice = error ? MESSAGES[error] : undefined;

  return (
    <form action={mode === "password" ? pwAction : mlAction} className="flex flex-col gap-4" noValidate={false}>
      {signedOut && !state.error && !state.info && (
        <Alert variant="success">
          <AlertDescription>You&apos;ve been signed out securely.</AlertDescription>
        </Alert>
      )}
      {notice && !state.error && (
        <Alert variant={notice.variant}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}
      {state.error && (
        <Alert variant="destructive" aria-live="assertive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.info && (
        <Alert variant="success" aria-live="polite">
          <AlertDescription>{state.info}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="next" value={next ?? "/"} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email address</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            className="h-11 pl-9"
            placeholder="you@gracenguard.com"
            defaultValue={state.email}
            key={state.email}
          />
        </div>
      </div>

      {mode === "password" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="h-11 px-9" />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-navy"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-charcoal">
        <input type="checkbox" name="remember" defaultChecked className="h-4 w-4 accent-[#101C2E]" />
        Keep me signed in on this device
      </label>

      <Button type="submit" variant="gold" size="lg" disabled={pending} className="h-12 rounded-xl text-base">
        {pending && <Loader2 className="animate-spin" />}
        {mode === "password" ? "Sign in securely" : "Email me a sign-in link"}
      </Button>
      <button type="button" onClick={() => setMode(mode === "password" ? "magic" : "password")} className="text-sm text-gold-deep underline-offset-4 hover:underline">
        {mode === "password" ? "Use a one-time email link instead" : "Use my password instead"}
      </button>
    </form>
  );
}
