"use client";

import { ArrowLeftIcon, PencilRulerIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Leads to the project's Studio HyperFrames page (timeline, captions, keyframes…), and back out of it.
 */
export function OpenStudioButton({ projectId, disabledReason }: { projectId: string; disabledReason: string | null }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  if (pathname === `${base}/studio`) {
    return (
      <Button variant="outline" asChild>
        <Link href={base}>
          <ArrowLeftIcon />
          Fermer le Studio
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
              Ouvrir dans le Studio HyperFrames
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href={`${base}/studio`}>
                <PencilRulerIcon />
                Ouvrir dans le Studio HyperFrames
              </Link>
            </Button>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {disabledReason ?? "L'éditeur complet : timeline, textes, animations. Tes modifications seront dans le prochain rendu."}
      </TooltipContent>
    </Tooltip>
  );
}
