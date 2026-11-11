"use client";

import { slugify } from "@studio/shared/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { clientApi } from "@/lib/api";

type TemplateScene = { path: string; label: string; duration: number };

/**
 * Makes a block of the blocks engine from a scene of a built template: its variables become the block's fields. The
 * studio checks the block with `hyperframes check` before saving it, which takes a few seconds.
 */
export function BlockFromTemplateDialog({ creationId, open, onOpenChange }: { creationId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [scenes, setScenes] = useState<TemplateScene[] | null>(null);
  const [scene, setScene] = useState("");
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [family, setFamily] = useState("");
  const [description, setDescription] = useState("");
  const [useWhen, setUseWhen] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    clientApi<TemplateScene[]>(`/creations/${creationId}/block-scenes`)
      .then((list) => {
        setScenes(list);
        setScene((current) => current || list[0]?.path || "");
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [open, creationId]);

  const blockId = idEdited ? id : slugify(name).slice(0, 41);
  const ready = scene && name.trim() && /^[a-z][a-z0-9-]{1,40}$/.test(blockId) && description.trim() && useWhen.trim() && (!family || /^[a-z][a-z0-9-]{1,40}$/.test(family));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await clientApi(`/creations/${creationId}/blocks`, {
        method: "POST",
        body: JSON.stringify({ scene, id: blockId, name: name.trim(), family: family || undefined, description: description.trim(), useWhen: useWhen.trim() }),
      });
      toast.success(`Bloc « ${name.trim()} » créé`, { action: { label: "Voir les blocs", onClick: () => router.push("/blocks") } });
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Transformer une scène en bloc</DialogTitle>
            <DialogDescription>
              Les variables de la scène deviennent les champs du bloc, ses valeurs par défaut son exemple. Le bloc rejoint la{" "}
              <Link href="/blocks" className="underline underline-offset-4">
                page Blocs
              </Link>{" "}
              et le moteur blocs peut le choisir.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="block-scene">Scène</FieldLabel>
              {/* Radix sends an empty value when its options arrive after the value: never a scene. */}
              <Select value={scene} onValueChange={(value) => value && setScene(value)} disabled={!scenes?.length}>
                <SelectTrigger id="block-scene" className="w-full">
                  <SelectValue placeholder={scenes ? "Aucune scène" : "Chargement…"} />
                </SelectTrigger>
                <SelectContent>
                  {scenes?.map((option) => (
                    <SelectItem key={option.path} value={option.path}>
                      {option.label} · {option.duration} s
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {scenes?.length === 0 && <FieldDescription>Ce template n&apos;a pas encore de composition : construis-le d&apos;abord.</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor="block-name">Nom du bloc</FieldLabel>
              <Input id="block-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Carte promo" />
            </Field>
            <Field>
              <FieldLabel htmlFor="block-id">Identifiant</FieldLabel>
              <Input
                id="block-id"
                value={blockId}
                onChange={(e) => {
                  setIdEdited(true);
                  setId(e.target.value);
                }}
                className="font-mono"
              />
              <FieldDescription>Minuscules, chiffres et tirets. Le storyboard le cite.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="block-family">Famille</FieldLabel>
              <Input id="block-family" value={family} onChange={(e) => setFamily(e.target.value.toLowerCase())} placeholder="ma-marque" className="font-mono" />
              <FieldDescription>
                Une famille existante (<code>neutral</code>, <code>editorial</code>) ou une nouvelle. Vide : le bloc est proposé dans toutes les familles.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="block-description">Ce que montre le bloc</FieldLabel>
              <Textarea id="block-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} />
            </Field>
            <Field>
              <FieldLabel htmlFor="block-use-when">Quand l&apos;utiliser</FieldLabel>
              <Textarea id="block-use-when" value={useWhen} onChange={(e) => setUseWhen(e.target.value)} maxLength={300} rows={2} />
              <FieldDescription>Le modèle lit cette phrase pour choisir le bloc.</FieldDescription>
            </Field>
          </FieldGroup>
          {error && <p className="text-sm whitespace-pre-wrap text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending || !ready}>
              {pending && <Spinner />}
              {pending ? "Vérification du bloc…" : "Créer le bloc"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
