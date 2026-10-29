import type { Metadata } from "next";
import { Lock, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/app/brand";
import { BRAND } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; signed_out?: string }> }) {
  const { next, error, signed_out } = await searchParams;
  const [grace, guard] = BRAND.tagline.split(". ");

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-ivory px-4 py-10">
      {/* soft brand glow */}
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-gold/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-40 h-[36rem] w-[36rem] rounded-full bg-navy/10 blur-3xl" />

      <div className="relative w-full max-w-5xl">
        <div className="grid gap-4 md:grid-cols-5 md:grid-rows-[1fr_auto]">
          {/* sign-in tile */}
          <section className="rounded-3xl border bg-card p-7 shadow-[0_20px_60px_-20px_rgba(16,28,46,0.25)] sm:p-10 md:col-span-3 md:row-span-2">
            <BrandMark tone="dark" />
            <div className="gold-rule my-6 w-24" />
            <h1 className="font-serif text-3xl font-semibold text-navy">Welcome back</h1>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">Sign in to the Grace &amp; Guard performance portal.</p>
            <LoginForm next={next} error={error} signedOut={signed_out === "1"} />
          </section>

          {/* tagline tile */}
          <section className="relative flex flex-col justify-between overflow-hidden rounded-3xl bg-navy p-8 text-ivory shadow-[0_20px_60px_-20px_rgba(16,28,46,0.45)] md:col-span-2">
            <div aria-hidden className="brushed-gold absolute inset-x-0 top-0 h-1" />
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-gold-light">{BRAND.descriptor}</p>
            <blockquote className="mt-10 font-serif text-3xl font-semibold leading-snug lg:text-4xl">
              <span className="block">
                <span className="text-gold-light">Grace</span>
                {grace.replace(/^Grace/, "")}.
              </span>
              <span className="mt-2 block">
                <span className="text-gold-light">Guard</span>
                {guard.replace(/^Guard/, "")}
              </span>
            </blockquote>
            <div className="gold-rule mt-10 w-20" />
          </section>

          {/* trust tiles */}
          <div className="grid grid-cols-2 gap-4 md:col-span-2">
            <section className="rounded-3xl border bg-cream/70 p-5">
              <Lock className="h-5 w-5 text-gold-deep" />
              <p className="mt-3 text-sm font-semibold text-navy">Encrypted session</p>
              <p className="mt-1 text-xs text-muted-foreground">HTTPS only, secure cookies, verified on every request.</p>
            </section>
            <section className="rounded-3xl border bg-cream/70 p-5">
              <ShieldCheck className="h-5 w-5 text-gold-deep" />
              <p className="mt-3 text-sm font-semibold text-navy">Private by design</p>
              <p className="mt-1 text-xs text-muted-foreground">Row-level security. No client health or identity data stored.</p>
            </section>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">portal.gracenguard.com · Authorized users only</p>
      </div>
    </main>
  );
}
