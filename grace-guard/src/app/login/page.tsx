import type { Metadata } from "next";
import { BrandMark } from "@/components/app/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 lg:flex">
        <BrandMark tone="light" className="[&>div:first-child]:text-4xl" />
        <div>
          <div className="gold-rule mb-6 w-24" />
          <p className="font-serif text-4xl font-semibold leading-tight text-ivory">Agency Performance Command Center</p>
          <p className="mt-4 max-w-md text-ivory/60">Daily production, pacing, revenue and lead performance — in one private, secure workspace.</p>
        </div>
        <p className="text-xs text-ivory/40">Private analytics workspace. No beneficiary health or identity data is stored.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandMark tone="dark" />
          </div>
          <h1 className="font-serif text-3xl font-semibold text-navy">Welcome back</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">Sign in to your command center.</p>
          <LoginForm next={next} error={error} />
        </div>
      </section>
    </main>
  );
}
