import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { pageWindow } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/** Previous / numbered / next links, keeping the other query parameters (the search). */
export function PaginationNav({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  const link = (target: number, label: React.ReactNode, disabled: boolean, aria?: string) =>
    disabled ? (
      <span className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "pointer-events-none opacity-40")} aria-hidden>
        {label}
      </span>
    ) : (
      <Link href={href(target)} scroll={false} aria-label={aria} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        {label}
      </Link>
    );

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1">
      {link(
        page - 1,
        <>
          <ChevronLeftIcon />
          <span className="hidden sm:inline">Précédent</span>
        </>,
        page <= 1,
        "Page précédente",
      )}
      {pageWindow(page, pages).map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={n}
            href={href(n)}
            scroll={false}
            aria-current={n === page ? "page" : undefined}
            className={cn(buttonVariants({ variant: n === page ? "outline" : "ghost", size: "sm" }), "min-w-8 tabular-nums", n === page && "bg-card shadow-surface")}
          >
            {n}
          </Link>
        ),
      )}
      {link(
        page + 1,
        <>
          <span className="hidden sm:inline">Suivant</span>
          <ChevronRightIcon />
        </>,
        page >= pages,
        "Page suivante",
      )}
    </nav>
  );
}
