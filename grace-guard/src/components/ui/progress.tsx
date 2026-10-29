"use client";
import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({ className, value, indicatorClassName, ...props }: React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <ProgressPrimitive.Root className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-cream", className)} value={v} {...props}>
      <ProgressPrimitive.Indicator className={cn("h-full w-full flex-1 bg-navy transition-transform", indicatorClassName)} style={{ transform: `translateX(-${100 - v}%)` }} />
    </ProgressPrimitive.Root>
  );
}
