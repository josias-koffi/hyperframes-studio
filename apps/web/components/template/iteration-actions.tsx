"use client";

import { CopyIcon, EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteDialog, NameDialog } from "@/components/studio/entity-dialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { clientApi, type Iteration } from "@/lib/api";

const base = (iteration: Pick<Iteration, "projectId">) => `/templates/${iteration.projectId}/iterations`;

/** Creates an iteration (from the defaults, or as a copy) and opens it. */
export async function createIteration(projectId: string, body: { name: string; values?: Record<string, unknown>; format?: string }) {
  return clientApi<Iteration>(`/projects/${projectId}/iterations`, { method: "POST", body: JSON.stringify(body) });
}

/** Rename, duplicate or delete an iteration, from its row or its page. */
export function IterationActions({ iteration, size = "default", leaveOnDelete }: { iteration: Iteration; size?: "default" | "sm"; leaveOnDelete?: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "duplicate" | "delete" | null>(null);
  const toggle = (name: NonNullable<typeof dialog>) => (open: boolean) => setDialog(open ? name : null);

  async function attempt(action: () => Promise<void>) {
    try {
      await action();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={size === "sm" ? "ghost" : "outline"} size={size === "sm" ? "icon-sm" : "icon"} aria-label="Actions de l'itération">
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <PencilIcon />
            Renommer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("duplicate")}>
            <CopyIcon />
            Dupliquer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2Icon />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NameDialog
        open={dialog === "rename"}
        onOpenChange={toggle("rename")}
        title="Renommer l'itération"
        initial={iteration.name}
        onSubmit={(name) =>
          attempt(async () => {
            await clientApi(`/iterations/${iteration.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
            router.refresh();
          })
        }
      />
      <NameDialog
        open={dialog === "duplicate"}
        onOpenChange={toggle("duplicate")}
        title="Dupliquer l'itération"
        description="La copie reprend les valeurs et le format ; ses rendus partent de zéro."
        initial={`${iteration.name} (copie)`}
        submitLabel="Dupliquer"
        onSubmit={(name) =>
          attempt(async () => {
            const copy = await createIteration(iteration.projectId, { name, values: iteration.values, format: iteration.format });
            router.push(`${base(iteration)}/${copy.id}`);
          })
        }
      />
      <DeleteDialog
        open={dialog === "delete"}
        onOpenChange={toggle("delete")}
        title={`Supprimer « ${iteration.name} » ?`}
        description="Ses valeurs et tous ses rendus sont supprimés définitivement."
        onConfirm={() =>
          attempt(async () => {
            await clientApi(`/iterations/${iteration.id}`, { method: "DELETE" });
            toast.success("Itération supprimée");
            if (leaveOnDelete) router.push(base(iteration));
            router.refresh();
          })
        }
      />
    </>
  );
}
