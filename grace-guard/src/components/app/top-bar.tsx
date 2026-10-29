"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Bell, BookOpen, ChevronDown, LogOut, Search, Settings, UserRound, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { METRICS } from "@/lib/kpi/definitions";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, navItemFor } from "./nav-items";

interface SearchItem {
  label: string;
  hint: string;
  href: string;
}

const SETTINGS_TABS: Array<[string, string]> = [
  ["campaign", "Campaign dates & details"],
  ["baseline", "Baseline corrections"],
  ["products", "Products"],
  ["carriers", "Carriers"],
  ["commissions", "Commission assumptions"],
  ["sources", "Lead sources"],
  ["schedule", "Dialing schedule & vacation days"],
  ["profile", "User profile"],
  ["data", "Import / export CSV"],
  ["integrations", "Integrations (GoHighLevel, WAVV)"],
];

const SEARCH_ITEMS: SearchItem[] = [
  { label: "Log today's activity", hint: "Action", href: "/activity" },
  ...NAV_ITEMS.map((n) => ({ label: n.label, hint: "Page", href: n.href })),
  ...SETTINGS_TABS.map(([tab, label]) => ({ label, hint: "Settings", href: `/settings?tab=${tab}` })),
  ...METRICS.map((m) => ({ label: m.label, hint: "Metric", href: `/metrics#${m.id}` })),
];

function withCampaign(href: string, campaign: string | null) {
  if (!campaign || href.startsWith("/metrics")) return href;
  return `${href}${href.includes("?") ? "&" : "?"}campaign=${encodeURIComponent(campaign)}`;
}

/** Quick jump to any page, settings tab or metric definition. */
function QuickSearch({ className, autoFocus, onDone }: { className?: string; autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return SEARCH_ITEMS.slice(0, 9);
    return SEARCH_ITEMS.filter((i) => i.label.toLowerCase().includes(term) || i.hint.toLowerCase().includes(term)).slice(0, 9);
  }, [q]);

  const go = (item: SearchItem | undefined) => {
    if (!item) return;
    router.push(withCampaign(item.href, sp.get("campaign")));
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
    onDone?.();
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        placeholder="Search pages, settings, metrics…"
        aria-label="Search"
        role="combobox"
        aria-expanded={open}
        aria-controls="quick-search-results"
        className="h-10 w-full rounded-full border border-input bg-ivory/70 pl-9 pr-4 text-sm shadow-inner shadow-navy/[0.02] placeholder:text-muted-foreground focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {open && results.length > 0 && (
        <ul id="quick-search-results" role="listbox" className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border bg-card p-1.5 shadow-[0_8px_30px_rgba(16,28,46,0.12)]">
          {results.map((r, i) => (
            <li key={`${r.hint}-${r.href}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(r)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm", i === active && "bg-cream")}
              >
                <span className="truncate text-charcoal">{r.label}</span>
                <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-wider text-gold-deep">{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconButton({ children, label, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("relative flex h-10 w-10 items-center justify-center rounded-full border bg-card text-navy transition-colors hover:bg-cream [&_svg]:h-[18px] [&_svg]:w-[18px]", className)}
      {...props}
    >
      {children}
    </button>
  );
}

export interface TopBarProps {
  name: string | null;
  email: string | null;
  /** has any daily entry been saved for today (in the user's time zone)? */
  todayLogged: boolean;
}

export function TopBar({ name, email, todayLogged }: TopBarProps) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const campaign = sp.get("campaign");
  const section = navItemFor(pathname);
  const [mobileSearch, setMobileSearch] = useState(false);
  const display = name || email || "Account";
  const initials = (name ? name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("") : (email ?? "?")[0]).toUpperCase();

  return (
    <header className="relative z-20 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75 lg:sticky lg:top-0">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-10">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-tight text-navy">{section.label}</p>
          <p className="truncate text-xs text-muted-foreground">{section.subtitle}</p>
        </div>

        <QuickSearch className="hidden w-72 md:block" />
        <IconButton label="Search" className="md:hidden" onClick={() => setMobileSearch(true)}>
          <Search />
        </IconButton>

        <Link
          href={withCampaign("/settings", campaign)}
          aria-label="Settings"
          title="Settings"
          className="hidden h-10 w-10 items-center justify-center rounded-full border bg-card text-navy hover:bg-cream sm:flex [&_svg]:h-[18px] [&_svg]:w-[18px]"
        >
          <Settings />
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="Notifications">
              <Bell />
              {!todayLogged && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-card bg-destructive" />}
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            {todayLogged ? (
              <p className="px-2.5 pb-2 text-sm text-muted-foreground">You&apos;re all caught up — today&apos;s activity is logged.</p>
            ) : (
              <DropdownMenuItem asChild>
                <Link href={withCampaign("/activity", campaign)} className="items-start">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
                  <span>
                    <span className="block font-medium text-navy">Today&apos;s activity isn&apos;t logged yet</span>
                    <span className="block text-xs text-muted-foreground">Log dials, connections and applications to keep pacing accurate.</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={withCampaign("/", campaign)}>See next best actions</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex h-10 items-center gap-2 rounded-full border bg-card px-3 text-sm font-medium text-navy transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
            title="Sign out"
          >
            <LogOut className="h-[18px] w-[18px]" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </form>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 rounded-full border bg-card p-1 pr-2 hover:bg-cream" aria-label="Account menu">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-semibold tracking-wide text-gold-light ring-2 ring-gold/40">{initials}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <span className="block truncate font-semibold text-navy">{display}</span>
              {name && email && <span className="block truncate">{email}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={withCampaign("/settings?tab=profile", campaign)}>
                <UserRound /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={withCampaign("/settings", campaign)}>
                <Settings /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/metrics">
                <BookOpen /> Metric dictionary
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action="/auth/signout" method="post">
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full">
                  <LogOut /> Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {mobileSearch && (
        <div className="flex items-center gap-2 border-t px-4 py-2 md:hidden">
          <QuickSearch className="flex-1" autoFocus onDone={() => setMobileSearch(false)} />
          <IconButton label="Close search" onClick={() => setMobileSearch(false)}>
            <X />
          </IconButton>
        </div>
      )}
    </header>
  );
}
