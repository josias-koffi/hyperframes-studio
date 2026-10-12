"use client";

import { AI_MODEL_KINDS, FAL_MODEL_KINDS, MEDIA_PRICE_KEYS, MODEL_CAPABILITIES, type AiModelKind, type ModelCapability } from "@studio/shared/browser";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CAPABILITY_META, MODEL_KIND_META } from "@/components/ai/labels";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  capabilities: ModelCapability[];
};

const EMPTY: ModelDraft = { openrouterId: "", kind: "tts", label: "", description: "", voices: [], capabilities: [] };

/**
 * Adds a model to the catalog (prefilled from the OpenRouter import, or by hand for a TTS model, which OpenRouter's
 * list does not hold) or edits one. The id and the kind of an existing model do not change.
 */
/** The fal families `scripts/shots.mjs` knows the fields of; another model gets the most common ones. */
const FAL_FAMILIES: Record<"image" | "video", string> = {
  image: "Reconnus : FLUX, FLUX Kontext, Nano Banana, Seedream v4. Un autre modèle reçoit les champs les plus courants : à essayer avant de le proposer.",
  video: "Reconnus : Veo 3, Kling (v2, v3, o3), Seedance 2, PixVerse V6, LTX-2.3, Wan 2.7 et 3.0, en image vers vidéo. Un autre modèle reçoit les champs les plus courants : à essayer avant de le proposer.",
};

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
  const fal = FAL_MODEL_KINDS.includes(form.kind);
  const priceFields =
    form.kind === "image"
      ? [{ key: MEDIA_PRICE_KEYS.image, label: "Prix par image ($)", placeholder: "0.003" }]
      : [
          { key: MEDIA_PRICE_KEYS.video, label: "Prix par seconde ($)", placeholder: "0.06" },
          { key: MEDIA_PRICE_KEYS.videoWithAudio, label: "Par seconde avec son ($, facultatif)", placeholder: "0.40" },
        ];
  const setPrice = (key: string, value: string) => {
    const pricing = { ...form.pricing };
    if (value.trim()) pricing[key] = value.trim();
    else delete pricing[key];
    setForm({ ...form, pricing });
  };

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
            body: JSON.stringify({
              label: form.label,
              description: form.description,
              voices: voiceList,
              capabilities: form.capabilities,
              ...(fal ? { pricing: form.pricing ?? {} } : {}),
            }),
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
              {editing
                ? "Le nom et la description s'affichent dans les choix des utilisateurs."
                : fal
                  ? "Endpoint fal tel qu'il figure sur la page du modèle, et son prix : fal ne le donne pas à l'appel."
                  : "Identifiant tel qu'OpenRouter le connaît : éditeur/modèle."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field>
                <FieldLabel htmlFor="model-id">{fal ? "Endpoint fal" : "Identifiant OpenRouter"}</FieldLabel>
                <Input
                  id="model-id"
                  required
                  disabled={editing}
                  className="font-mono text-sm"
                  placeholder={form.kind === "image" ? "fal-ai/flux/schnell" : form.kind === "video" ? "fal-ai/kling-video/v3/pro/image-to-video" : "mistralai/voxtral-mini-tts-2603"}
                  value={form.openrouterId}
                  onChange={(event) => setForm({ ...form, openrouterId: event.target.value })}
                />
                {fal && !editing && <FieldDescription>{FAL_FAMILIES[form.kind as "image" | "video"]}</FieldDescription>}
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
            {form.kind === "agent" && (
              <Field>
                <FieldLabel>Capacités</FieldLabel>
                <div className="flex flex-wrap gap-4">
                  {MODEL_CAPABILITIES.map((capability) => (
                    <label key={capability} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.capabilities.includes(capability)}
                        onCheckedChange={(checked) =>
                          setForm({
                            ...form,
                            capabilities: checked ? [...form.capabilities, capability] : form.capabilities.filter((item) => item !== capability),
                          })
                        }
                      />
                      {CAPABILITY_META[capability].label}
                    </label>
                  ))}
                </div>
                <FieldDescription>Lues sur OpenRouter à l&apos;import. Seul un modèle avec vision peut analyser les rushs ou faire le contrôle visuel.</FieldDescription>
              </Field>
            )}
            {fal && (
              <Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  {priceFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <FieldLabel htmlFor={`price-${field.key}`}>{field.label}</FieldLabel>
                      <Input
                        id={`price-${field.key}`}
                        inputMode="decimal"
                        className="font-mono text-sm"
                        placeholder={field.placeholder}
                        value={form.pricing?.[field.key] ?? ""}
                        onChange={(event) => setPrice(field.key, event.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <FieldDescription>
                  Relevé sur la page du modèle chez fal, modifiable à tout moment. Le studio estime le coût des plans et applique le budget avec ce
                  prix ; sans prix, chaque génération demande une confirmation.
                </FieldDescription>
              </Field>
            )}
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
