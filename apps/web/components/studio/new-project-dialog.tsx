"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { clientApi, type Project } from "@/lib/api";
import { WORKFLOWS } from "./labels";

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/** The brief fields mirror the BRIEF.md frontmatter the workflows expect. */
export function NewProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [workflow, setWorkflow] = useState<string>("product-launch-video");

  async function submit(form: FormData) {
    setPending(true);
    try {
      const brief = {
        message: form.get("message"),
        audience: form.get("audience"),
        length: form.get("length"),
        aspect: form.get("aspect"),
        language: "fr",
        notes: form.get("notes"),
      };
      const project = await clientApi<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name, slug: slugify(name), workflow, brief }),
      });
      setOpen(false);
      router.push(`/projects/${project.id}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Nouveau projet</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau projet vidéo</DialogTitle>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            {name && <p className="font-mono text-xs text-muted-foreground">videos/{slugify(name)}</p>}
          </div>
          <div className="space-y-2">
            <Label>Type de vidéo</Label>
            <Select value={workflow} onValueChange={setWorkflow}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORKFLOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message clé</Label>
            <Textarea id="message" name="message" required rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="length">Durée</Label>
              <Input id="length" name="length" defaultValue="30s" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aspect">Format</Label>
              <Input id="aspect" name="aspect" defaultValue="1080x1920" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="audience">Audience</Label>
            <Input id="audience" name="audience" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes, URL, contraintes</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name}>
              {pending ? "Création…" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
