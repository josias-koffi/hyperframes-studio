"use client";

import { LayoutTemplateIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clientApi } from "@/lib/api";

/** Registers the project as a template; the API refuses a composition without variables. */
export function SaveTemplateButton({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      await clientApi("/templates", { method: "POST", body: JSON.stringify({ projectId, name }) });
      toast.success("Template enregistré");
      router.push("/templates");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" onClick={save} disabled={pending}>
          <LayoutTemplateIcon />
          Enregistrer comme template
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Réutilise cette vidéo en changeant ses variables (textes, couleurs) sans relancer Claude.
      </TooltipContent>
    </Tooltip>
  );
}
