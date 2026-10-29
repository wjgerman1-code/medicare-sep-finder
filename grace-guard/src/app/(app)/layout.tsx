import { Suspense } from "react";
import { BrandMark } from "@/components/app/brand";
import { Sidebar } from "@/components/app/sidebar";
import { TopBar } from "@/components/app/top-bar";
import { getWorkspace } from "@/lib/data/queries";
import { todayInTimeZone } from "@/lib/dates";

// every dashboard page is per-user and must render at request time
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ws = await getWorkspace();
  const today = todayInTimeZone(ws.profile.timezone);
  const { count } = await ws.supabase.from("daily_activity").select("id", { count: "exact", head: true }).eq("activity_date", today);

  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-14 bg-navy lg:fixed lg:inset-y-0 lg:w-64" />}>
        <Sidebar brand={<BrandMark tone="light" />} email={ws.email} />
      </Suspense>
      <div className="lg:pl-64">
        <Suspense fallback={<div className="h-16 border-b bg-card" />}>
          <TopBar name={ws.profile.full_name} email={ws.email} todayLogged={(count ?? 0) > 0} />
        </Suspense>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
