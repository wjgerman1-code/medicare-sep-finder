/**
 * Page intro under the top bar. The section title lives in the top bar (as in
 * the reference layout), so here it is an accessible heading only, followed
 * by the page's description and actions.
 */
export function PageHeader({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="sr-only">{title}</h1>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-navy">{children}</h2>
      {aside}
    </div>
  );
}
