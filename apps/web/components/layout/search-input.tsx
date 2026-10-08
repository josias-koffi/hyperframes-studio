"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Search kept in the URL (`?q=`): typing waits a beat, then reloads the page on its first page of results. */
export function SearchInput({ placeholder, className }: { placeholder: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function navigate(query: string) {
    const next = new URLSearchParams(params);
    if (query.trim()) next.set("q", query.trim());
    else next.delete("q");
    next.delete("page");
    startTransition(() => router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false }));
  }

  function change(query: string) {
    setValue(query);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(query), 250);
  }

  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && change("")}
        placeholder={placeholder}
        aria-label={placeholder}
        className="bg-card pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center">
        {pending ? (
          <Spinner className="mr-1 size-4 text-muted-foreground" />
        ) : (
          value && (
            <button type="button" onClick={() => change("")} className="rounded-sm p-1 text-muted-foreground hover:text-foreground">
              <XIcon className="size-3.5" />
              <span className="sr-only">Effacer la recherche</span>
            </button>
          )
        )}
      </span>
    </div>
  );
}
