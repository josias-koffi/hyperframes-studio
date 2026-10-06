"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clientApi } from "@/lib/api";

/** Registers the project as a template; the API refuses a composition without variables. */
export function SaveTemplateButton({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      await clientApi("/templates", { method: "POST", body: JSON.stringify({ projectId, name }) });
      router.push("/templates");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" onClick={save} disabled={pending}>
      Enregistrer comme template
    </Button>
  );
}
