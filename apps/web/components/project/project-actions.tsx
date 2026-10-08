"use client";

import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteDialog, NameDialog } from "@/components/studio/entity-dialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { clientApi, type Project } from "@/lib/api";

/** Rename or delete a video or a template, from its header or its row in a list. */
export function ProjectActions({
  project,
  deleteBlocked,
  afterDelete,
  size = "default",
}: {
  project: Pick<Project, "id" | "name" | "kind" | "slug">;
  deleteBlocked?: boolean;
  /** Where to go once deleted: the list of its kind by default, the current page with "". */
  afterDelete?: string;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const noun = project.kind === "template" ? "template" : "vidéo";
  const list = project.kind === "template" ? "/templates" : "/projects";

  async function rename(name: string) {
    try {
      await clientApi(`/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      router.refresh();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    }
  }

  async function remove() {
    try {
      await clientApi(`/projects/${project.id}`, { method: "DELETE" });
      toast.success(`${project.name} supprimé`);
      if (afterDelete === "") router.refresh();
      else router.push(afterDelete ?? list);
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
        title={`Renommer le ${noun === "vidéo" ? "projet" : noun}`}
        initial={project.name}
        onSubmit={rename}
      />
      <DeleteDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={`Supprimer « ${project.name} » ?`}
        description={
          <>
            Le dossier <code className="font-mono">videos/{project.slug}</code>, ses assets, ses rendus
            {project.kind === "template" ? " et toutes ses itérations" : ""} sont supprimés définitivement.
          </>
        }
        onConfirm={remove}
      />
    </>
  );
}
