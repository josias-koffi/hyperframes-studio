"use client";

import { formatTimecode, layoutLanes, snapTargets, snapTime, type Clip, type ClipKind, type Composition } from "@studio/shared/browser";
import { MagnetIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { useEditor } from "../editor-context";
import { engineUrl, peaksUrl, thumbnailUrl } from "../engine";

const KIND_STYLE: Record<ClipKind, string> = {
  video: "bg-sky-500/80 border-sky-600 text-white",
  scene: "bg-primary/80 border-primary text-primary-foreground",
  image: "bg-amber-500/80 border-amber-600 text-white",
  text: "bg-fuchsia-500/80 border-fuchsia-600 text-white",
  element: "bg-slate-500/80 border-slate-600 text-white",
  captions: "bg-teal-500/80 border-teal-600 text-white",
  voice: "bg-emerald-500/80 border-emerald-600 text-white",
  music: "bg-rose-500/80 border-rose-600 text-white",
};

const ROW = 40;
const GUTTER = 112;
const SNAP_PX = 8;

type Drag = { key: string; mode: "move" | "start" | "end"; originX: number; start: number; duration: number; moved: boolean };

/** Bars of an audio file's loudness, from the engine's peaks. */
function Waveform({ src }: { src: string }) {
  const { creation } = useEditor();
  const [bins, setBins] = useState<number[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(peaksUrl(creation.id, src))
      .then((response) => (response.ok ? (response.json() as Promise<{ bins: number[] }>) : null))
      .then((body) => !cancelled && body && setBins(body.bins))
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [creation.id, src]);
  if (!bins?.length) return null;
  const step = Math.max(1, Math.floor(bins.length / 400));
  const sampled = bins.filter((_, index) => index % step === 0);
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-60" preserveAspectRatio="none" viewBox={`0 0 ${sampled.length} 100`}>
      {sampled.map((value, index) => (
        <rect key={index} x={index} width={0.7} y={50 - value * 45} height={Math.max(1, value * 90)} fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * One frame of a clip, `at` seconds into it: a scene's from its own file (the engine caches it by that file's
 * content, so moving or trimming the clip costs nothing), a video's straight from its media.
 */
function ClipFrame({ clip, at, width, left }: { clip: Clip; at: number; width: number; left: number }) {
  const { creation } = useEditor();
  const style = { width, left };
  if (clip.kind === "video" && clip.src) {
    return (
      <video
        src={`${engineUrl(creation.id, `preview/${clip.src}`)}#t=${(clip.mediaStart + at).toFixed(2)}`}
        preload="metadata"
        muted
        playsInline
        style={style}
        className="absolute inset-y-0 h-full object-cover"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- frame of the composition from the engine
    <img
      alt=""
      loading="lazy"
      src={thumbnailUrl(creation.id, clip.compositionSrc!, at)}
      style={style}
      className="absolute inset-y-0 h-full object-cover"
    />
  );
}

/**
 * The timeline: a ruler with the playhead, then one block of rows per simplified track (video, scenes, texts and
 * images, captions, voice, music). Clips move by dragging, trim by their edges; the magnet snaps to the playhead
 * and to other clips' edges.
 */
export function Timeline({
  composition,
  selected,
  onSelect,
  onMove,
  onTrim,
}: {
  composition: Composition;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onMove: (clip: Clip, start: number) => void;
  onTrim: (clip: Clip, edge: "start" | "end", time: number) => void;
}) {
  const { playback, control, previewReady } = useEditor();
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [magnet, setMagnet] = useState(true);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const lanes = useMemo(() => layoutLanes(composition.clips), [composition.clips]);
  const span = composition.duration * 1.08 + 1;
  const pps = Math.max(8, ((width - GUTTER - 16) / span) * zoom);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const toTime = (clientX: number) => {
    const box = scroller.current!.getBoundingClientRect();
    return Math.max(0, (clientX - box.left - GUTTER + scroller.current!.scrollLeft) / pps);
  };

  function seekFrom(event: React.PointerEvent) {
    const seek = (clientX: number) => control("seek", { timeSeconds: Math.min(composition.duration, toTime(clientX)) });
    seek(event.clientX);
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent) => seek(move.clientX);
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  }

  function startDrag(event: React.PointerEvent, clip: Clip, mode: Drag["mode"]) {
    event.stopPropagation();
    onSelect(clip.key);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const next = { key: clip.key, mode, originX: event.clientX, start: clip.start, duration: clip.duration, moved: false };
    dragRef.current = next;
    setDrag(next);
  }

  function updateDrag(event: React.PointerEvent, clip: Clip) {
    const current = dragRef.current;
    if (!current || current.key !== clip.key) return;
    const delta = (event.clientX - current.originX) / pps;
    if (!current.moved && Math.abs(event.clientX - current.originX) < 3) return;
    const targets = magnet ? snapTargets(composition, playback.time, clip.key) : [];
    const threshold = SNAP_PX / pps;
    let next: Drag;
    if (current.mode === "move") {
      let start = Math.max(0, clip.start + delta);
      const snappedStart = snapTime(start, targets, threshold);
      const snappedEnd = snapTime(start + clip.duration, targets, threshold);
      start = snappedStart !== start ? snappedStart : snappedEnd !== start + clip.duration ? snappedEnd - clip.duration : start;
      next = { ...current, start, moved: true };
    } else if (current.mode === "start") {
      const start = Math.min(clip.start + clip.duration - 0.1, snapTime(Math.max(0, clip.start + delta), targets, threshold));
      next = { ...current, start, duration: clip.start + clip.duration - start, moved: true };
    } else {
      const end = Math.max(clip.start + 0.1, snapTime(clip.start + clip.duration + delta, targets, threshold));
      next = { ...current, duration: end - clip.start, moved: true };
    }
    dragRef.current = next;
    setDrag(next);
  }

  function endDrag(clip: Clip) {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current?.moved) return;
    if (current.mode === "move") onMove(clip, current.start);
    else if (current.mode === "start") onTrim(clip, "start", current.start);
    else onTrim(clip, "end", current.start + current.duration);
  }

  const ticks = useMemo(() => {
    const every = [0.5, 1, 2, 5, 10, 15, 30, 60].find((candidate) => candidate * pps >= 70) ?? 60;
    return Array.from({ length: Math.floor(span / every) + 1 }, (_, index) => index * every);
  }, [pps, span]);

  const thumbHeight = 34;
  const thumbWidth = Math.round((thumbHeight * composition.width) / composition.height);

  return (
    <div className="flex h-full min-h-0 flex-col border-t bg-muted/20">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        <span className="text-xs font-medium text-muted-foreground">Timeline</span>
        <span className="ml-2 font-mono text-xs tabular-nums">
          {formatTimecode(playback.time)} / {formatTimecode(composition.duration)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Toggle size="sm" pressed={magnet} onPressedChange={setMagnet} aria-label="Aimant" title="Aimant : colle aux bords des clips et à la tête de lecture">
            <MagnetIcon />
          </Toggle>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setZoom((value) => Math.max(1, value / 1.5))} aria-label="Dézoomer">
            <ZoomOutIcon />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setZoom((value) => Math.min(40, value * 1.5))} aria-label="Zoomer">
            <ZoomInIcon />
          </Button>
        </div>
      </div>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto select-none" onPointerDown={() => onSelect(null)}>
        <div className="relative" style={{ width: GUTTER + span * pps + 16 }}>
          {/* Ruler */}
          <div className="sticky top-0 z-20 flex h-6 border-b bg-background/95" onPointerDown={(event) => (event.stopPropagation(), seekFrom(event))}>
            <div className="sticky left-0 z-10 shrink-0 border-r bg-background" style={{ width: GUTTER }} />
            <div className="relative flex-1 cursor-pointer">
              {ticks.map((tick) => (
                <span key={tick} className="absolute top-0 h-full border-l border-border pl-1 text-[10px] text-muted-foreground" style={{ left: tick * pps }}>
                  {formatTimecode(tick).replace(/\.00$/, "")}
                </span>
              ))}
              <div className="absolute top-0 h-full bg-foreground/5" style={{ left: composition.duration * pps, right: 0 }} />
            </div>
          </div>
          {/* Lanes */}
          {lanes.map((lane) => (
            <div key={lane.id} className="flex border-b">
              <div className="sticky left-0 z-10 flex shrink-0 items-start border-r bg-background px-2 pt-2 text-xs font-medium text-muted-foreground" style={{ width: GUTTER }}>
                {lane.label}
              </div>
              <div className="relative flex-1" style={{ height: lane.rows.length * ROW + 4 }}>
                {lane.rows.map((row, rowIndex) =>
                  row.map((clip) => {
                    const live = drag?.key === clip.key ? drag : null;
                    const start = live?.start ?? clip.start;
                    const duration = live?.duration ?? clip.duration;
                    const isAudio = clip.kind === "voice" || clip.kind === "music";
                    const thumbs = (clip.kind === "scene" && clip.compositionSrc) || (clip.kind === "video" && clip.src) ? Math.max(1, Math.min(3, Math.floor((duration * pps) / (thumbWidth * 3)))) : 0;
                    return (
                      <div
                        key={clip.key}
                        className={cn(
                          "absolute flex cursor-grab items-center overflow-hidden rounded-md border text-[11px] font-medium shadow-surface active:cursor-grabbing",
                          KIND_STYLE[clip.kind],
                          selected === clip.key && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                          live && "z-10 opacity-90",
                        )}
                        style={{ left: start * pps, width: Math.max(6, duration * pps), top: rowIndex * ROW + 3, height: ROW - 6 }}
                        title={`${clip.label} · ${formatTimecode(clip.start)} → ${formatTimecode(clip.start + clip.duration)}`}
                        onPointerDown={(event) => startDrag(event, clip, "move")}
                        onPointerMove={(event) => updateDrag(event, clip)}
                        onPointerUp={() => endDrag(clip)}
                        onPointerCancel={() => endDrag(clip)}
                      >
                        {isAudio && clip.src && <Waveform src={clip.src} />}
                        {thumbs > 0 && previewReady && (
                          <div className="pointer-events-none absolute inset-0 opacity-70">
                            {Array.from({ length: thumbs }, (_, index) => (
                              <ClipFrame key={index} clip={clip} at={((index + 0.5) * clip.duration) / thumbs} width={thumbWidth} left={(index * duration * pps) / thumbs} />
                            ))}
                          </div>
                        )}
                        <span className="relative truncate px-2 drop-shadow-sm">{clip.label}</span>
                        <span
                          className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-black/0 hover:bg-black/25"
                          onPointerDown={(event) => startDrag(event, clip, "start")}
                          onPointerMove={(event) => updateDrag(event, clip)}
                          onPointerUp={() => endDrag(clip)}
                        />
                        <span
                          className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-black/0 hover:bg-black/25"
                          onPointerDown={(event) => startDrag(event, clip, "end")}
                          onPointerMove={(event) => updateDrag(event, clip)}
                          onPointerUp={() => endDrag(clip)}
                        />
                      </div>
                    );
                  }),
                )}
              </div>
            </div>
          ))}
          {/* Playhead */}
          <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-rec" style={{ left: GUTTER + playback.time * pps }}>
            <div className="absolute -top-0 -left-1.5 size-3 rotate-45 rounded-[2px] bg-rec" />
          </div>
        </div>
      </div>
    </div>
  );
}
