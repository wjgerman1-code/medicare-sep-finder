"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const campaign = sp.get("campaign");
  const qs = campaign ? `?campaign=${encodeURIComponent(campaign)}` : "";
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={`${href}${qs}`}
            prefetch={false}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-gold/45 bg-gold/15 text-gold-light shadow-[inset_0_1px_0_rgba(216,195,154,0.15)]"
                : "border-transparent text-ivory/70 hover:bg-white/[0.05] hover:text-ivory",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-gold" : "text-ivory/50 group-hover:text-ivory/80")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ivory/60 hover:bg-white/[0.04] hover:text-ivory">
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </form>
  );
}

export function Sidebar({ brand, email }: { brand: React.ReactNode; email: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy px-4 py-6 lg:flex">
        <div className="px-2">{brand}</div>
        <div className="gold-rule my-6" />
        <NavLinks />
        <div className="mt-auto space-y-2">
          <div className="gold-rule mb-3" />
          {email && <p className="truncate px-3 text-xs text-ivory/40">{email}</p>}
          <SignOut />
        </div>
      </aside>

      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-navy px-4 py-3 lg:hidden">
        <div className="scale-90 origin-left">{brand}</div>
        <button onClick={() => setOpen(true)} className="rounded-md p-2 text-ivory" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-navy px-4 py-6 shadow-2xl">
            <div className="flex items-start justify-between px-2">
              {brand}
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-ivory/70" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="gold-rule my-6" />
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="mt-auto">
              <SignOut />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
