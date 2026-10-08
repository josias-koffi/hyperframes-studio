"use client";

import { applyPatches, elementAttributes, formatTimecode, layersOf, parseStyle, type Clip, type Composition } from "@studio/shared/browser";
import { ScissorsIcon, Trash2Icon } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useEditor } from "../editor-context";
import { ColorInput, Field, NumberInput, Section, SliderInput, TextArea, TextInput, TextPieces, textOperation, toHex } from "../fields";
import type { VideoActions } from "./use-video-actions";

const KIND_NAME: Record<Clip["kind"], string> = {
  video: "Vidéo",
  scene: "Scène",
  image: "Image",
  text: "Texte",
  element: "Bloc",
  captions: "Sous-titres",
  voice: "Voix",
  music: "Musique",
};

/** The texts of a scene, edited in its own file (`compositions/…`). */
function SceneTexts({ path }: { path: string }) {
  const { files, load, run } = useEditor();
  const source = files[path]?.content;
  useEffect(() => {
    void load(path).catch(() => null);
  }, [load, path]);
  if (!source) return <p className="text-xs text-muted-foreground">Chargement des textes…</p>;
  const texts = layersOf(source).filter((layer) => layer.kind === "text" && layer.text);
  if (texts.length === 0) return <p className="text-xs text-muted-foreground">Cette scène n&apos;a pas de texte modifiable ici. Demande à Claude.</p>;
  return (
    <div className="space-y-3">
      {texts.map((layer) => (
        <Field key={layer.key} label={layer.named ? layer.label : `Texte (${layer.tag})`}>
          <TextPieces
            runs={layer.runs}
            onCommit={(value, index) =>
              void run(
                path,
                (html) =>
                  applyPatches(html, [{ target: layer.target, operations: [textOperation(value, index)] }]),
                { label: "Texte de la scène" },
              )
            }
          />
        </Field>
      ))}
    </div>
  );
}

/** Properties of the selected clip, or of the whole video when nothing is selected. */
export function ClipInspector({ clip, composition, actions, source }: { clip: Clip | null; composition: Composition; actions: VideoActions; source: string }) {
  const { playback, lock } = useEditor();

  if (!clip) {
    return (
      <div>
        <Section title="Vidéo">
          <p className="text-xs text-muted-foreground">
            {composition.width} × {composition.height} px · {composition.clips.length} clips
          </p>
          <Field label="Durée totale">
            <NumberInput value={composition.duration} min={0.5} step={0.5} suffix="s" onCommit={(value) => void actions.length(value)} disabled={Boolean(lock)} />
          </Field>
        </Section>
        <Section title="Astuces">
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            <li>Clique sur un clip de la timeline pour le modifier.</li>
            <li>Glisse un clip pour le déplacer, ses bords pour le rogner.</li>
            <li>Espace : lecture · S : couper · Suppr : supprimer.</li>
          </ul>
        </Section>
      </div>
    );
  }

  const style = parseStyle(elementAttributes(source, clip.key)?.style);
  const fontSize = Number.parseFloat(style.get("font-size") ?? "") || 72;
  const canSplit = playback.time > clip.start + 0.05 && playback.time < clip.start + clip.duration - 0.05;

  return (
    <div>
      <Section title={KIND_NAME[clip.kind]}>
        <Field label="Nom">
          <TextInput value={clip.label} onCommit={(value) => void actions.rename(clip, value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Début">
            <NumberInput value={clip.start} min={0} step={0.1} suffix="s" onCommit={(value) => void actions.move(clip, value)} />
          </Field>
          <Field label="Durée">
            <NumberInput value={clip.duration} min={0.1} step={0.1} suffix="s" onCommit={(value) => void actions.trim(clip, "end", clip.start + value)} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatTimecode(clip.start)} → {formatTimecode(clip.start + clip.duration)}
        </p>
      </Section>

      {clip.kind === "text" && (
        <Section title="Texte">
          <Field label="Contenu">
            <TextArea value={clip.text} onCommit={(value) => void actions.text(clip, value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Taille">
              <NumberInput value={fontSize} min={8} max={600} suffix="px" onCommit={(value) => void actions.style(clip.target, "font-size", `${value}px`, "Taille du texte")} />
            </Field>
            <Field label="Couleur">
              <ColorInput value={toHex(style.get("color")) || "#ffffff"} onCommit={(value) => void actions.style(clip.target, "color", value, "Couleur du texte")} />
            </Field>
          </div>
        </Section>
      )}

      {clip.kind === "scene" && clip.compositionSrc && (
        <Section title="Textes de la scène">
          <SceneTexts path={clip.compositionSrc} />
        </Section>
      )}

      {clip.volume !== null && (
        <Section title="Son">
          <Field label="Volume">
            <SliderInput value={clip.volume} onCommit={(value) => void actions.volume(clip, value)} format={(value) => `${Math.round(value * 100)} %`} />
          </Field>
          {clip.src && <p className="truncate text-xs text-muted-foreground">Fichier : {clip.src}</p>}
        </Section>
      )}

      <Section title="Actions">
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" disabled={!canSplit || Boolean(lock)} onClick={() => void actions.split(clip, playback.time)}>
            <ScissorsIcon />
            Couper à la tête de lecture
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" disabled={Boolean(lock)} onClick={() => void actions.remove(clip)}>
            <Trash2Icon />
            Supprimer le clip
          </Button>
        </div>
      </Section>
    </div>
  );
}
