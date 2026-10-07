export function PageHeader({
  actions,
  description,
  title,
  eyebrow,
}: {
  actions?: React.ReactNode;
  description?: React.ReactNode;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="flex rise-in flex-col gap-3 px-4 md:flex-row md:items-end md:justify-between lg:px-6">
      <div className="min-w-0 space-y-1">
        {eyebrow}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
