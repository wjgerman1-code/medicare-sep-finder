import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      gold: "border-gold/40 bg-gold/10 text-gold-deep",
      outline: "border-border text-muted-foreground",
      success: "border-transparent bg-success/10 text-success",
      warning: "border-transparent bg-warning/10 text-warning",
      destructive: "border-transparent bg-destructive/10 text-destructive",
      forecast: "border-dashed border-[#8a94a6] bg-[#8a94a6]/10 text-[#4f5869]",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
