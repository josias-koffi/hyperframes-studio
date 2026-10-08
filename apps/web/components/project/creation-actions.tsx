"use client";

import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteDialog, NameDialog } from "@/components/studio/entity-dialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { clientApi, type Creation } from "@/lib/api";
import { projectHref } from "@/lib/creation-state";
import { CREATION_TYPE_META } from "@/components/studio/labels";

/** Rename or delete a création, from its header, its card or its row in a list. */
export function CreationActions({
  creation,
  deleteBlocked,
  afterDelete,
  size = "default",
}: {
  creation: Pick<Creation, "id" | "name" | "kind" | "slug" | "type" | "projectId">;
  deleteBlocked?: boolean;
  /** Where to go once deleted: its project by default, the current page with "". */
  afterDelete?: string;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const noun = creation.kind === "template" ? "le template" : CREATION_TYPE_META[creation.type].noun;

  async function rename(name: string) {
    try {
      await clientApi(`/creations/${creation.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      router.refresh();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
  }

  async function remove() {
    try {
      await clientApi(`/creations/${creation.id}`, { method: "DELETE" });
      toast.success(`${creation.name} supprimé`);
      if (afterDelete === "") router.refresh();
      else router.push(afterDelete ?? projectHref(creation.projectId));
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
          <Button variant={size === "sm" ? "ghost" : "outline"} size={size === "sm" ? "icon-sm" : "icon"} aria-label="Actions" onClick={(e) => e.stopPropagation()}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <PencilIcon />
            Renommer
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={deleteBlocked} onSelect={() => setDialog("delete")}>
            <Trash2Icon />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NameDialog
        open={dialog === "rename"}
        onOpenChange={(open) => setDialog(open ? "rename" : null)}
        title={`Renommer ${noun}`}
        initial={creation.name}
        onSubmit={rename}
      />
      <DeleteDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={`Supprimer « ${creation.name} » ?`}
        description={
          <>
            Le dossier <code className="font-mono">videos/{creation.slug}</code>, ses assets, ses rendus
            {creation.kind === "template" ? " et toutes ses itérations" : ""} sont supprimés définitivement.
          </>
        }
        onConfirm={remove}
      />
    </>
  );
}
