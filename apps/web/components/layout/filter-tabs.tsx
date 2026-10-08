import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type FilterTab = { label: string; href: string; active: boolean; count?: number; icon?: LucideIcon };

/** A row of filters as links, so the choice lives in the URL; each tab says how many items it holds. */
export function FilterTabs({ tabs, label, className }: { tabs: FilterTab[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("flex gap-1 overflow-x-auto", className)}>
      {tabs.map(({ label: text, href, active, count, icon: Icon }) => (
        <Link
          key={text}
          href={href}
          scroll={false}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-accent",
            active ? "border-primary bg-accent font-medium" : "bg-card",
          )}
        >
          {Icon && <Icon className="size-4 text-muted-foreground" />}
          {text}
          {count !== undefined && <span className="rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{count}</span>}
        </Link>
      ))}
    </nav>
  );
}
