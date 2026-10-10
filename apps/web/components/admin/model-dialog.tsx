"use client";

import { AI_MODEL_KINDS, type AiModelKind } from "@studio/shared/browser";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MODEL_KIND_META } from "@/components/ai/labels";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { clientApi, type AiModel } from "@/lib/api";

export type ModelDraft = {
  openrouterId: string;
  kind: AiModelKind;
  label: string;
  description: string;
  voices: string[];
  pricing?: Record<string, string>;
  contextLength?: number | null;
};

const EMPTY: ModelDraft = { openrouterId: "", kind: "tts", label: "", description: "", voices: [] };

/**
 * Adds a model to the catalog (prefilled from the OpenRouter import, or by hand for a TTS model, which OpenRouter's
 * list does not hold) or edits one. The id and the kind of an existing model do not change.
 */
export function ModelDialog({
  open,
  onOpenChange,
  model,
  draft,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing this model. */
  model?: AiModel;
  /** Creating from these values. */
  draft?: ModelDraft;
  onSaved: () => void;
}) {
  const initial = model ?? draft ?? EMPTY;
  const [form, setForm] = useState<ModelDraft>({ ...EMPTY, ...initial });
  const [voices, setVoices] = useState(initial.voices.join(", "));
  const [pending, startTransition] = useTransition();
  const editing = Boolean(model);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const voiceList = voices
      .split(/[\s,]+/)
      .map((voice) => voice.trim())
      .filter(Boolean);
    startTransition(async () => {
      try {
        if (model) {
          await clientApi(`/admin/ai-models/${model.id}`, {
            method: "PATCH",
            body: JSON.stringify({ label: form.label, description: form.description, voices: voiceList }),
          });
        } else {
          await clientApi("/admin/ai-models", { method: "POST", body: JSON.stringify({ ...form, voices: voiceList }) });
        }
        toast.success(editing ? "Modèle mis à jour" : "Modèle ajouté au catalogue");
        onOpenChange(false);
        onSaved();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le modèle" : "Ajouter un modèle"}</DialogTitle>
            <DialogDescription>
              {editing ? "Le nom et la description s'affichent dans les choix des utilisateurs." : "Identifiant tel qu'OpenRouter le connaît : éditeur/modèle."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field>
                <FieldLabel htmlFor="model-id">Identifiant OpenRouter</FieldLabel>
                <Input
                  id="model-id"
                  required
                  disabled={editing}
                  className="font-mono text-sm"
                  placeholder="mistralai/voxtral-mini-tts-2603"
                  value={form.openrouterId}
                  onChange={(event) => setForm({ ...form, openrouterId: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="model-kind">Type</FieldLabel>
                <Select value={form.kind} onValueChange={(kind) => setForm({ ...form, kind: kind as AiModelKind })} disabled={editing}>
                  <SelectTrigger id="model-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODEL_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {MODEL_KIND_META[kind].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="model-label">Nom affiché</FieldLabel>
              <Input id="model-label" required value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="model-description">Description</FieldLabel>
              <Textarea
                id="model-description"
                rows={3}
                placeholder="Pour quoi le conseiller : rapide et économique, meilleur sur le design…"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
            {form.kind === "tts" && (
              <Field>
                <FieldLabel htmlFor="model-voices">Voix</FieldLabel>
                <Input id="model-voices" className="font-mono text-sm" placeholder="fr_marie_neutral, fr_paul_warm" value={voices} onChange={(event) => setVoices(event.target.value)} />
                <FieldDescription>Séparées par des virgules. Vide : l&apos;utilisateur saisit l&apos;identifiant de voix.</FieldDescription>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
