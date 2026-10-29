import { Suspense } from "react";
import { BrandMark } from "@/components/app/brand";
import { Sidebar } from "@/components/app/sidebar";
import { getWorkspace } from "@/lib/data/queries";

// every dashboard page is per-user and must render at request time
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ws = await getWorkspace();
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-14 bg-navy lg:fixed lg:inset-y-0 lg:w-64" />}>
        <Sidebar brand={<BrandMark tone="light" />} email={ws.email} />
      </Suspense>
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
