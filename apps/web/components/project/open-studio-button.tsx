"use client";

import { ExternalLinkIcon, PencilRulerIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clientApi } from "@/lib/api";

/**
 * Opens the project in the HyperFrames Studio editor (timeline, captions, keyframes…).
 * The tab is opened before the request so the browser does not treat it as a popup.
 */
export function OpenStudioButton({ projectId, disabledReason }: { projectId: string; disabledReason: string | null }) {
  const [pending, setPending] = useState(false);

  async function open() {
    const tab = window.open("about:blank", "_blank");
    setPending(true);
    try {
      const { url } = await clientApi<{ url: string }>(`/projects/${projectId}/studio`, { method: "POST" });
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
    } catch (error) {
      tab?.close();
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  const button = (
    <Button variant="outline" onClick={open} disabled={pending || disabledReason !== null}>
      <PencilRulerIcon />
      {pending ? "Ouverture du Studio…" : "Ouvrir dans le Studio HyperFrames"}
      <ExternalLinkIcon className="opacity-60" />
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events: the span keeps the tooltip alive. */}
        <span tabIndex={disabledReason ? 0 : -1}>{button}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {disabledReason ?? "L'éditeur complet : timeline, textes, animations. Tes modifications seront dans le prochain rendu."}
      </TooltipContent>
    </Tooltip>
  );
}
