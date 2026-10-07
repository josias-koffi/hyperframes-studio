"use client";

import { RotateCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={() => startTransition(() => router.refresh())}>
          <RotateCwIcon className={cn(pending && "animate-spin")} />
          <span className="sr-only">Rafraîchir</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Rafraîchir</TooltipContent>
    </Tooltip>
  );
}
