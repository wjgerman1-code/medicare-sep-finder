import { BRAND } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * Official logo when NEXT_PUBLIC_BRAND_LOGO_URL is configured; otherwise a
 * plain text wordmark. The GG monogram is never drawn or approximated here.
 */
export function BrandMark({ tone = "light", className, compact = false }: { tone?: "light" | "dark"; className?: string; compact?: boolean }) {
  if (BRAND.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={BRAND.logoUrl} alt={`${BRAND.name} — ${BRAND.descriptor}`} className={cn("h-12 w-auto object-contain", className)} />
    );
  }
  return (
    <div className={cn("leading-none", className)}>
      <div className={cn("font-serif text-2xl font-semibold tracking-wide", tone === "light" ? "text-ivory" : "text-navy")}>{BRAND.name}</div>
      {!compact && (
        <div className={cn("mt-1 text-[0.65rem] font-medium uppercase tracking-[0.28em]", tone === "light" ? "text-gold-light" : "text-gold-deep")}>
          {BRAND.descriptor}
        </div>
      )}
    </div>
  );
}
