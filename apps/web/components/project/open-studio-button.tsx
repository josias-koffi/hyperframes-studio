"use client";

import { ArrowLeftIcon, PencilRulerIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Leads to the création's editor (video editor, or image and carousel editor), and back out of it.
 */
export function OpenStudioButton({ base, disabledReason }: { base: string; disabledReason: string | null }) {
  const pathname = usePathname();

  if (pathname === `${base}/studio`) {
    return (
      <Button variant="outline" asChild>
        <Link href={base}>
          <ArrowLeftIcon />
          Fermer l&apos;éditeur
        </Link>
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events: the span keeps the tooltip alive. */}
        <span tabIndex={disabledReason ? 0 : -1}>
          {disabledReason ? (
            <Button variant="outline" disabled>
              <PencilRulerIcon />
              Éditer
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href={`${base}/studio`}>
                <PencilRulerIcon />
                Éditer
              </Link>
            </Button>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {disabledReason ?? "Retouche tout à la main ou demande à Claude. Tes modifications seront dans le prochain export."}
      </TooltipContent>
    </Tooltip>
  );
}
