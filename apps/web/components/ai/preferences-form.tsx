"use client";

import { MODEL_SLOTS, REALISTIC_BUDGET_EUR, VISION_SLOTS, type AgentBackend, type AiPreferences, type ModelSlot } from "@studio/shared/browser";
import { AudioLinesIcon, BotIcon, ClapperboardIcon, CpuIcon, MusicIcon, SaveIcon, TerminalSquareIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clientApi, type AiModel } from "@/lib/api";
import { cn } from "@/lib/utils";
import { mediaPriceLabel, MODEL_SLOT_META, tokenPrice } from "./labels";

const INHERIT = "__inherit";

type Props = {
  /** `user`: the person's own choices over the platform defaults. `defaults`: the admin edits those defaults. */
  mode: "user" | "defaults";
  models: AiModel[];
  value: AiPreferences;
  /** What an empty slot falls back to (the platform defaults), shown in the « par défaut » option. */
  fallback?: AiPreferences;
  backend?: { value: AgentBackend };
};

/** The model chosen per step, per editor change and for the audio, saved in one go. */
/** What the studio's proxy imposes on every OpenRouter call (voice and music included). */
const OPENROUTER_PRIVACY =
  "OpenRouter (États-Unis) n'envoie tes demandes qu'à des fournisseurs qui n'entraînent pas leurs modèles dessus, et à un fournisseur qui ne garde rien quand le modèle en a un (badge « Rétention zéro » du catalogue).";

export function PreferencesForm({ mode, models, value, fallback, backend }: Props) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<AiPreferences>(value);
  const [engine, setEngine] = useState<AgentBackend>(backend?.value ?? "opencode");
  const [saved, setSaved] = useState(() => JSON.stringify({ value, engine: backend?.value ?? "opencode" }));
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify({ value: prefs, engine }) !== saved;

  const byKind = useMemo(
    () => ({
      agent: models.filter((model) => model.kind === "agent"),
      tts: models.filter((model) => model.kind === "tts"),
      music: models.filter((model) => model.kind === "music"),
      image: models.filter((model) => model.kind === "image"),
      video: models.filter((model) => model.kind === "video"),
    }),
    [models],
  );
  const labelOf = (id: string | undefined) => (id ? (models.find((model) => model.openrouterId === id)?.label ?? id) : undefined);
  const onClaudeCode = engine === "claude-code";

  const vision = (id: string | undefined) => byKind.agent.some((model) => model.openrouterId === id && model.capabilities.includes("vision"));

  /** The models a slot may take: a vision slot only those that read images. */
  const choicesFor = (slot: ModelSlot) => (VISION_SLOTS.includes(slot) ? byKind.agent.filter((model) => model.capabilities.includes("vision")) : byKind.agent);

  /** What the « par défaut » option of a slot stands for. */
  function inherited(slot: ModelSlot): string {
    const visionSlot = VISION_SLOTS.includes(slot);
    if (mode === "defaults") return slot === "build" ? "Aucun" : visionSlot ? "Le build s'il lit les images" : "Comme le build";
    const id = [fallback?.models[slot], fallback?.models.build].find((candidate) => candidate && (!visionSlot || vision(candidate)));
    return labelOf(id) ?? (visionSlot ? "Aucun modèle avec vision" : "Aucun");
  }

  function setModel(slot: ModelSlot, next: string) {
    setPrefs((current) => {
      const models = { ...current.models };
      if (next === INHERIT) delete models[slot];
      else models[slot] = next;
      return { ...current, models };
    });
  }

  function setMedia(key: Exclude<keyof AiPreferences["media"], "budgetEur">, next: string | undefined) {
    setPrefs((current) => {
      const media = { ...current.media, [key]: next || undefined };
      // A voice belongs to its model: changing the model drops the voice.
      if (key === "ttsModel") media.ttsVoice = undefined;
      return { ...current, media };
    });
  }

  function save() {
    startTransition(async () => {
      try {
        if (mode === "defaults") await clientApi("/admin/ai-defaults", { method: "PUT", body: JSON.stringify(prefs) });
        else await clientApi("/me/ai-settings", { method: "PUT", body: JSON.stringify({ preferences: prefs, agentBackend: engine }) });
        setSaved(JSON.stringify({ value: prefs, engine }));
        toast.success(mode === "defaults" ? "Modèles par défaut enregistrés" : "Préférences enregistrées");
        router.refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    });
  }

  const ttsModel = byKind.tts.find((model) => model.openrouterId === (prefs.media.ttsModel ?? (mode === "user" ? fallback?.media.ttsModel : undefined)));
  const voices = ttsModel?.voices ?? [];

  return (
    <div className="flex flex-col gap-6">
      {backend && (
        <SectionCard
          title="Moteur"
          description="Claude Code tourne sur ton propre abonnement Claude, sans coût par génération : il faut la commande claude installée et connectée sur ce poste."
        >
          <div role="radiogroup" aria-label="Moteur de génération" className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { value: "opencode", icon: CpuIcon, title: "OpenCode · OpenRouter", text: "Les modèles choisis ci-dessous, facturés à la génération." },
                { value: "claude-code", icon: TerminalSquareIcon, title: "Claude Code · abonnement", text: "Sonnet et Opus par étape, sur ton abonnement Claude." },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={engine === option.value}
                onClick={() => setEngine(option.value)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  engine === option.value && "border-primary bg-accent",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <option.icon className="size-4" />
                </span>
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">{option.text}</span>
                </span>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <BotIcon className="size-4 text-primary" />
            Génération
          </span>
        }
        description={
          onClaudeCode
            ? "Avec Claude Code, chaque étape garde ses modèles Claude : ces choix servent quand tu repasses sur OpenCode."
            : mode === "defaults"
              ? `Le modèle de chaque étape pour tous les utilisateurs qui n'ont rien choisi. Le build sert de défaut général. ${OPENROUTER_PRIVACY}`
              : `Le modèle qui travaille à chaque étape. Laisse « par défaut » pour suivre les choix de la plateforme. ${OPENROUTER_PRIVACY}`
        }
      >
        {byKind.agent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun modèle de génération n&apos;est proposé pour l&apos;instant.</p>
        ) : (
          <FieldGroup className={cn("gap-0 divide-y", onClaudeCode && "opacity-60")}>
            {MODEL_SLOTS.map((slot) => (
              <Field key={slot} className="py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <FieldContent>
                  <FieldLabel htmlFor={`model-${slot}`}>{MODEL_SLOT_META[slot].label}</FieldLabel>
                  <FieldDescription>{MODEL_SLOT_META[slot].hint}</FieldDescription>
                </FieldContent>
                <Select value={prefs.models[slot] ?? INHERIT} onValueChange={(next) => setModel(slot, next)} disabled={onClaudeCode}>
                  <SelectTrigger id={`model-${slot}`} className="w-full sm:w-72 sm:shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT}>
                      <span className="text-muted-foreground">Par défaut · {inherited(slot)}</span>
                    </SelectItem>
                    {choicesFor(slot).map((model) => (
                      <SelectItem key={model.id} value={model.openrouterId}>
                        <span className="flex flex-col">
                          <span>{model.label}</span>
                          {tokenPrice(model) && <span className="text-xs text-muted-foreground">{tokenPrice(model)}</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </FieldGroup>
        )}
      </SectionCard>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <AudioLinesIcon className="size-4 text-primary" />
            Voix et musique
          </span>
        }
        description="Utilisés par l'étape « Voix et musique » des vidéos narrées."
      >
        <FieldGroup className="gap-0 divide-y">
          <Field className="pb-3 sm:flex-row sm:items-center sm:justify-between">
            <FieldContent>
              <FieldLabel htmlFor="tts-model">Voix de synthèse</FieldLabel>
              <FieldDescription>Le modèle qui lit le script.</FieldDescription>
            </FieldContent>
            <Select value={prefs.media.ttsModel ?? INHERIT} onValueChange={(next) => setMedia("ttsModel", next === INHERIT ? undefined : next)}>
              <SelectTrigger id="tts-model" className="w-full sm:w-72 sm:shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INHERIT}>
                  <span className="text-muted-foreground">
                    Par défaut · {mode === "defaults" ? "celui du workspace" : (labelOf(fallback?.media.ttsModel) ?? "celui du workspace")}
                  </span>
                </SelectItem>
                {byKind.tts.map((model) => (
                  <SelectItem key={model.id} value={model.openrouterId}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="py-3 sm:flex-row sm:items-center sm:justify-between">
            <FieldContent>
              <FieldLabel htmlFor="tts-voice">Voix</FieldLabel>
              <FieldDescription>{voices.length ? `${voices.length} voix pour ${ttsModel?.label}.` : "Identifiant de voix du modèle."}</FieldDescription>
            </FieldContent>
            {voices.length > 0 ? (
              <Select value={prefs.media.ttsVoice ?? INHERIT} onValueChange={(next) => setMedia("ttsVoice", next === INHERIT ? undefined : next)}>
                <SelectTrigger id="tts-voice" className="w-full sm:w-72 sm:shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INHERIT}>
                    <span className="text-muted-foreground">Par défaut{fallback?.media.ttsVoice ? ` · ${fallback.media.ttsVoice}` : ""}</span>
                  </SelectItem>
                  {voices.map((voice) => (
                    <SelectItem key={voice} value={voice}>
                      {voice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="tts-voice"
                className="w-full sm:w-72 sm:shrink-0"
                placeholder={fallback?.media.ttsVoice ?? "fr_marie_neutral"}
                value={prefs.media.ttsVoice ?? ""}
                onChange={(event) => setPrefs((current) => ({ ...current, media: { ...current.media, ttsVoice: event.target.value.trim() || undefined } }))}
              />
            )}
          </Field>
          <Field className="pt-3 sm:flex-row sm:items-center sm:justify-between">
            <FieldContent>
              <FieldLabel htmlFor="music-model" className="flex items-center gap-1.5">
                <MusicIcon className="size-3.5 text-muted-foreground" />
                Musique
              </FieldLabel>
              <FieldDescription>Le modèle qui compose le fond musical.</FieldDescription>
            </FieldContent>
            <Select value={prefs.media.musicModel ?? INHERIT} onValueChange={(next) => setMedia("musicModel", next === INHERIT ? undefined : next)}>
              <SelectTrigger id="music-model" className="w-full sm:w-72 sm:shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={INHERIT}>
                  <span className="text-muted-foreground">
                    Par défaut · {mode === "defaults" ? "celui du workspace" : (labelOf(fallback?.media.musicModel) ?? "celui du workspace")}
                  </span>
                </SelectItem>
                {byKind.music.map((model) => (
                  <SelectItem key={model.id} value={model.openrouterId}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </SectionCard>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <ClapperboardIcon className="size-4 text-primary" />
            Vidéos réalistes
          </span>
        }
        description="Les plans des vidéos réalistes sont générés par fal (Features & Labels, États-Unis, sans région européenne) avec la clé fal de ce poste : chaque utilisateur contracte directement avec fal. Une image de référence n'y part qu'avec ton accord, donné à la création."
      >
        <FieldGroup className="gap-0 divide-y">
          {(
            [
              { key: "imageModel", kind: "image", label: "Images clés", hint: "Une image par plan, rapide et bon marché : elle fixe le cadre avant la vidéo." },
              { key: "videoDraftModel", kind: "video", label: "Plans en brouillon", hint: "Le premier rendu de chaque plan : un modèle bon marché." },
              { key: "videoFinalModel", kind: "video", label: "Plans en rendu final", hint: "Seulement pour les plans validés. Par défaut, celui du brouillon." },
            ] as const
          ).map(({ key, kind, label, hint }) => (
            <Field key={key} className="py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
              <FieldContent>
                <FieldLabel htmlFor={`media-${key}`}>{label}</FieldLabel>
                <FieldDescription>{hint}</FieldDescription>
              </FieldContent>
              <Select value={prefs.media[key] ?? INHERIT} onValueChange={(next) => setMedia(key, next === INHERIT ? undefined : next)}>
                <SelectTrigger id={`media-${key}`} className="w-full sm:w-72 sm:shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INHERIT}>
                    <span className="text-muted-foreground">Par défaut · {mode === "defaults" ? "aucun" : (labelOf(fallback?.media[key]) ?? "aucun")}</span>
                  </SelectItem>
                  {byKind[kind].map((model) => (
                    <SelectItem key={model.id} value={model.openrouterId}>
                      <span className="flex flex-col">
                        <span>{model.label}</span>
                        <span className="text-xs text-muted-foreground">{mediaPriceLabel(model) ?? "Prix non renseigné"}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ))}
          <Field className="pt-3 sm:flex-row sm:items-center sm:justify-between">
            <FieldContent>
              <FieldLabel htmlFor="media-budget">Budget par création (€)</FieldLabel>
              <FieldDescription>Au-delà, la génération des plans s&apos;arrête et demande une confirmation. Le prix vient du catalogue : c&apos;est une estimation.</FieldDescription>
            </FieldContent>
            <Input
              id="media-budget"
              type="number"
              min={0.5}
              max={1000}
              step={0.5}
              className="w-full sm:w-72 sm:shrink-0"
              placeholder={String(fallback?.media.budgetEur ?? REALISTIC_BUDGET_EUR)}
              value={prefs.media.budgetEur ?? ""}
              onChange={(event) => {
                const next = Number.parseFloat(event.target.value);
                setPrefs((current) => ({ ...current, media: { ...current.media, budgetEur: Number.isFinite(next) && next > 0 ? next : undefined } }));
              }}
            />
          </Field>
        </FieldGroup>
      </SectionCard>

      <div className="sticky bottom-2 z-10 flex items-center justify-end gap-3 rounded-xl border bg-background/90 px-4 py-3 shadow-raised backdrop-blur">
        {dirty && (
          <Badge variant="outline" className="border-warning/40 text-warning">
            Modifications non enregistrées
          </Badge>
        )}
        <Button onClick={save} disabled={!dirty || pending}>
          <SaveIcon />
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
