"use client";

import { EllipsisIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteDialog } from "@/components/studio/entity-dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { clientApi, type Project } from "@/lib/api";
import { projectHref } from "@/lib/creation-state";

type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Name and campaign context of a project: every création's brief starts from them. */
export function ProjectDialog({ open, onOpenChange, project }: OpenProps & { project?: Pick<Project, "id" | "name" | "context"> }) {
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? "");
  const [context, setContext] = useState(project?.context ?? "");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const body = JSON.stringify({ name: name.trim(), context: context.trim() });
      if (project) {
        await clientApi(`/projects/${project.id}`, { method: "PATCH", body });
        router.refresh();
      } else {
        const created = await clientApi<Project>("/projects", { method: "POST", body });
        router.push(projectHref(created.id));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(project?.name ?? "");
          setContext(project?.context ?? "");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{project ? "Modifier le projet" : "Nouveau projet"}</DialogTitle>
            <DialogDescription>
              Un projet regroupe les vidéos, carrousels et images d&apos;une même campagne. Son contexte est repris dans
              le brief de chacune.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-name">Nom</FieldLabel>
              <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus placeholder="Ex. : Lancement offre Pro — Q4" />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-context">Contexte de la campagne</FieldLabel>
              <Textarea
                id="project-context"
                rows={5}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                maxLength={5000}
                placeholder="Offre, cible, ton, dates, mentions obligatoires, charte…"
              />
              <FieldDescription>Facultatif. Claude s&apos;en sert pour que toutes les créations parlent d&apos;une même voix.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Spinner />}
              {project ? "Enregistrer" : "Créer le projet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewProjectButton({ size, variant, label = "Nouveau projet" }: { size?: "default" | "sm" | "lg"; variant?: "default" | "outline"; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      <ProjectDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Edit or delete a project, from its page or its card. */
export function ProjectActions({ project, size = "default" }: { project: Pick<Project, "id" | "name" | "context">; size?: "default" | "sm" }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);

  async function remove() {
    try {
      await clientApi(`/projects/${project.id}`, { method: "DELETE" });
      toast.success(`${project.name} supprimé`);
      router.push("/projects");
      router.refresh();
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
          <Button
            variant={size === "sm" ? "ghost" : "outline"}
            size={size === "sm" ? "icon-sm" : "icon"}
            aria-label="Actions du projet"
            onClick={(e) => e.preventDefault()}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <PencilIcon />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2Icon />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectDialog open={dialog === "edit"} onOpenChange={(open) => setDialog(open ? "edit" : null)} project={project} />
      <DeleteDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={`Supprimer « ${project.name} » ?`}
        description="Toutes ses créations (dossiers, rendus, itérations) et ses assets sont supprimés définitivement."
        onConfirm={remove}
      />
    </>
  );
}
