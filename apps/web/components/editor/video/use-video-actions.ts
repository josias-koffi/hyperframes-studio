"use client";

import {
  applyPatches,
  insertElement,
  moveClip,
  nextTrack,
  parseComposition,
  removeElementSource,
  setClipLabel,
  setCompositionDuration,
  setVolume,
  shiftClipTweens,
  splitClipSource,
  trimClip,
  type Clip,
  type Composition,
  type ElementPatch,
  type NewElement,
} from "@studio/shared/browser";
import { useCallback, useMemo } from "react";
import { useEditor } from "../editor-context";
import type { ImportedAsset } from "../media-panel";

export const INDEX = "index.html";

/** The video's composition (index.html) and the edits the editor makes to it, computed here and shown at once. */
export function useVideoActions() {
  const { files, run, playback } = useEditor();
  const source = files[INDEX]?.content ?? null;
  const composition = useMemo<Composition | null>(() => (source ? parseComposition(source) : null), [source]);

  const apply = useCallback(
    (patches: ElementPatch[], label: string, path = INDEX) =>
      patches.length === 0 ? Promise.resolve(false) : run(path, (html) => applyPatches(html, patches), { label }),
    [run],
  );

  const move = useCallback(
    (clip: Clip, start: number) => {
      if (!composition) return;
      const patches = moveClip(composition, clip, start);
      if (patches.length === 0) return;
      const delta = Math.round((Math.max(0, start) - clip.start) * 1000) / 1000;
      // The root timeline's tweens on the clip (its transitions) move with it.
      return run(INDEX, (html) => shiftClipTweens(applyPatches(html, patches), clip.id ?? "", delta), { label: `Déplacer « ${clip.label} »` });
    },
    [composition, run],
  );

  const trim = useCallback(
    (clip: Clip, edge: "start" | "end", time: number) => composition && apply(trimClip(composition, clip, edge, time), `Rogner « ${clip.label} »`),
    [apply, composition],
  );

  const split = useCallback(
    (clip: Clip, time: number) => {
      if (time <= clip.start + 0.05 || time >= clip.start + clip.duration - 0.05) return Promise.resolve(false);
      return run(INDEX, (html) => splitClipSource(html, clip, time).html, { label: `Couper « ${clip.label} »` });
    },
    [run],
  );

  const remove = useCallback((clip: Clip) => run(INDEX, (html) => removeElementSource(html, clip.target), { label: `Supprimer « ${clip.label} »` }), [run]);

  const volume = useCallback((clip: Clip, value: number) => apply([setVolume(clip, value)], `Volume de « ${clip.label} »`), [apply]);
  const rename = useCallback((clip: Clip, label: string) => apply([setClipLabel(clip, label)], "Renommer"), [apply]);
  const text = useCallback(
    (clip: Clip, value: string) => apply([{ target: clip.target, operations: [{ type: "text-content", value }] }], `Texte de « ${clip.label} »`),
    [apply],
  );
  const style = useCallback(
    (target: ElementPatch["target"], property: string, value: string | null, label: string, path = INDEX) =>
      apply([{ target, operations: [{ type: "inline-style", property, value }] }], label, path),
    [apply],
  );
  const length = useCallback(
    (duration: number) => composition && apply(setCompositionDuration(composition, duration), "Durée de la vidéo"),
    [apply, composition],
  );

  /** Adds an element at the playhead, on a track of its own. */
  const insert = useCallback(
    (element: NewElement, duration: number) => {
      if (!composition) return Promise.resolve(false);
      const start = Math.min(playback.time, Math.max(0, composition.duration - 0.5));
      const isText = element.kind === "text";
      return run(
        INDEX,
        (html) =>
          insertElement(html, element, {
            x: isText ? composition.width * 0.08 : composition.width * 0.25,
            y: isText ? composition.height * 0.42 : composition.height * 0.25,
            width: isText ? composition.width * 0.84 : element.kind === "image" ? composition.width * 0.5 : undefined,
            height: element.kind === "image" ? composition.height * 0.5 : undefined,
            start,
            duration: Math.max(0.5, Math.min(duration, composition.duration - start)),
            track: nextTrack(html),
          }).html,
        { label: isText ? "Ajouter un texte" : "Ajouter un média" },
      );
    },
    [composition, playback.time, run],
  );
  const addAsset = useCallback(
    async (asset: ImportedAsset) => {
      if (!composition) return;
      const label = asset.filename.replace(/\.[^.]+$/, "");
      if (asset.kind === "audio") {
        await insert({ kind: "audio", src: asset.path, label }, composition.duration - Math.min(playback.time, composition.duration - 0.5));
      } else if (asset.kind === "video") {
        await insert({ kind: "video", src: asset.path, label }, 5);
      } else {
        await insert({ kind: "image", src: asset.path, label }, 3);
      }
    },
    [composition, insert, playback.time],
  );

  return { composition, move, trim, split, remove, volume, rename, text, style, length, insert, addAsset };
}

export type VideoActions = ReturnType<typeof useVideoActions>;
