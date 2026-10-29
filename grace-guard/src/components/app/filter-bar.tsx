"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export interface FilterBarProps {
  campaigns: Array<{ slug: string; name: string }>;
  /** slug of the campaign currently shown (resolved on the server) */
  current: string;
  products?: Array<{ id: string; name: string }>;
  showDates?: boolean;
  showProduct?: boolean;
  campaignRange?: { start: string; end: string };
}

export function FilterBar({ campaigns, current, products = [], showDates = true, showProduct = true, campaignRange }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "campaign") {
      next.delete("from");
      next.delete("to");
    }
    start(() => router.push(`${pathname}?${next.toString()}`));
  };

  const hasFilters = sp.get("from") || sp.get("to") || sp.get("product");

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
        Campaign
        <Select value={current} onChange={(e) => set("campaign", e.target.value)} aria-label="Campaign">
          {campaigns.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      {showDates && (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <Input type="date" value={sp.get("from") ?? ""} min={campaignRange?.start} max={campaignRange?.end} onChange={(e) => set("from", e.target.value || null)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <Input type="date" value={sp.get("to") ?? ""} min={campaignRange?.start} max={campaignRange?.end} onChange={(e) => set("to", e.target.value || null)} />
          </label>
        </>
      )}
      {showProduct && products.length > 0 && (
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
          Product
          <Select value={sp.get("product") ?? ""} onChange={(e) => set("product", e.target.value || null)} aria-label="Product">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      <div className="flex items-center gap-2">
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = new URLSearchParams();
              const c = sp.get("campaign");
              if (c) next.set("campaign", c);
              start(() => router.push(`${pathname}?${next.toString()}`));
            }}
          >
            <RotateCcw /> Reset
          </Button>
        )}
        {pending && <Loader2 className="h-4 w-4 animate-spin text-gold" aria-label="Loading" />}
      </div>
    </div>
  );
}
