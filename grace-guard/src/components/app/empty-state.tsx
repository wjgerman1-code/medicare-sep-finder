import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon, title, children, className }: { icon?: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-cream/40 px-6 py-10 text-center", className)}>
      {Icon && <Icon className="h-8 w-8 text-gold" />}
      <p className="font-serif text-lg font-semibold text-navy">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
