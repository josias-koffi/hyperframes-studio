"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "__all";

/** A select bound to one query parameter; changing it goes back to the first page. */
export function ParamSelect({
  name,
  options,
  allLabel,
  label,
  icon,
  className,
}: {
  name: string;
  options: { value: string; label: string; count?: number }[];
  allLabel: string;
  label: string;
  /** Rendered here, not passed as a component: a server page cannot hand a function to a client one. */
  icon?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const value = params.get(name) ?? ALL;

  function change(next: string) {
    const query = new URLSearchParams(params);
    if (next === ALL) query.delete(name);
    else query.set(name, next);
    query.delete("page");
    startTransition(() => router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger aria-label={label} className={cn("bg-card", pending && "opacity-70", className)}>
        {icon}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
            {option.count !== undefined && <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">{option.count}</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
