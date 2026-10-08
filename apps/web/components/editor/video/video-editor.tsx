"use client";

import { formatTimecode } from "@studio/shared/browser";
import { ChevronFirstIcon, PauseIcon, PlayIcon, ScissorsIcon, StepBackIcon, StepForwardIcon, TypeIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AssetKind } from "@/lib/api";
import { useEditor } from "../editor-context";
import { SidePanel } from "../editor-shell";
import { MediaPanel } from "../media-panel";
import { Preview } from "../preview";
import { ClipInspector } from "./clip-inspector";
import { Timeline } from "./timeline";
import { INDEX, useVideoActions } from "./use-video-actions";

const MEDIA_KINDS: AssetKind[] = ["image", "logo", "video", "audio"];
const FRAME = 1 / 30;

/**
 * The video editor, laid out like any editing software: media on the left, the preview in the middle, the
 * properties (and Claude) on the right, the timeline below.
 */
export function VideoEditor() {
  const { load, files, playback, control, lock } = useEditor();
  const actions = useVideoActions();
  const { composition } = actions;
  const [selected, setSelected] = useState<string | null>(null);
  const clip = useMemo(() => composition?.clips.find((candidate) => candidate.key === selected) ?? null, [composition, selected]);

  useEffect(() => {
    void load(INDEX);
  }, [load]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === " ") {
        event.preventDefault();
        control(playback.playing ? "pause" : "play");
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        control("seek", { timeSeconds: Math.max(0, playback.time + (event.key === "ArrowLeft" ? -1 : 1) * FRAME * (event.shiftKey ? 30 : 1)) });
      } else if (clip && !lock && event.key.toLowerCase() === "s") {
        void actions.split(clip, playback.time);
      } else if (clip && !lock && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        void actions.remove(clip);
      } else if (event.key === "Escape") {
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, clip, control, lock, playback]);

  if (!composition || !files[INDEX]) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const context = clip ? `clip « ${clip.label} » (${clip.kind}, ${clip.id ? `#${clip.id}, ` : ""}de ${clip.start.toFixed(2)} s à ${(clip.start + clip.duration).toFixed(2)} s)` : null;
  const canSplit = clip && playback.time > clip.start + 0.05 && playback.time < clip.start + clip.duration - 0.05;

  return (
    <div className="grid h-full min-h-0 grid-cols-[15rem_minmax(0,1fr)_19rem] grid-rows-[minmax(0,1fr)_17rem]">
      <aside className="min-h-0 overflow-y-auto border-r">
        <div className="space-y-2 border-b p-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ajouter</h3>
          <Button variant="outline" size="sm" className="w-full justify-start" disabled={Boolean(lock)} onClick={() => void actions.insert({ kind: "text", text: "Votre texte" }, 3)}>
            <TypeIcon />
            Texte à la tête de lecture
          </Button>
        </div>
        <MediaPanel kinds={MEDIA_KINDS} onAdd={actions.addAsset} />
      </aside>

      <section className="flex min-h-0 flex-col bg-muted/30">
        <Preview width={composition.width} height={composition.height} className="flex-1 p-4" />
        <div className="flex h-11 shrink-0 items-center justify-center gap-1 border-t bg-background">
          <Button variant="ghost" size="icon" onClick={() => control("seek", { timeSeconds: 0 })} aria-label="Début">
            <ChevronFirstIcon />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => control("seek", { timeSeconds: Math.max(0, playback.time - FRAME) })} aria-label="Image précédente">
            <StepBackIcon />
          </Button>
          <Button size="icon" className="rounded-full" onClick={() => control(playback.playing ? "pause" : "play")} aria-label={playback.playing ? "Pause" : "Lecture"}>
            {playback.playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => control("seek", { timeSeconds: playback.time + FRAME })} aria-label="Image suivante">
            <StepForwardIcon />
          </Button>
          <span className="ml-2 w-32 font-mono text-xs text-muted-foreground tabular-nums">
            {formatTimecode(playback.time)} / {formatTimecode(composition.duration)}
          </span>
          <Button variant="ghost" size="sm" disabled={!canSplit || Boolean(lock)} onClick={() => clip && void actions.split(clip, playback.time)}>
            <ScissorsIcon />
            Couper
          </Button>
        </div>
      </section>

      <aside className="row-span-2 min-h-0 border-l">
        <SidePanel context={context} properties={<ClipInspector clip={clip} composition={composition} actions={actions} source={files[INDEX].content} />} />
      </aside>

      <div className="col-span-2 min-h-0">
        <Timeline
          composition={composition}
          selected={clip?.key ?? null}
          onSelect={setSelected}
          onMove={(target, start) => void actions.move(target, start)}
          onTrim={(target, edge, time) => void actions.trim(target, edge, time)}
        />
      </div>
    </div>
  );
}
