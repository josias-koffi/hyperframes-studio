import { ClapperboardIcon } from "lucide-react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group/brand flex items-center gap-2 font-semibold">
      <span className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-surface transition-transform duration-200 ease-studio group-hover/brand:-rotate-6">
        <ClapperboardIcon className="size-4" strokeWidth={1.75} />
        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-rec ring-2 ring-sidebar" />
      </span>
      <span className="truncate text-base tracking-tight group-data-[collapsible=icon]:hidden">
        {BRAND.lead}
        <span className="text-primary">{BRAND.accent}</span>
      </span>
    </Link>
  );
}
