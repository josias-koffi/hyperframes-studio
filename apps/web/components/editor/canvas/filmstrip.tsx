"use client";

import { slidesOf, type Slide } from "@studio/shared/browser";
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditor } from "../editor-context";
import { thumbnailUrl } from "../engine";
import type { CanvasActions } from "./use-canvas-actions";

/** The carousel's slides in order: go from one to the next, add, copy, delete, or drag one to reorder. */
export function Filmstrip({
  slides,
  current,
  onChange,
  width,
  height,
  actions,
}: {
  slides: Slide[];
  current: number;
  onChange: (index: number) => void;
  width: number;
  height: number;
  actions: CanvasActions;
}) {
  const { creation, files, lock, previewReady } = useEditor();
  // Thumbnails come from the saved file: a slide's is asked again once a change to that slide is written.
  const saved = files["index.html"]?.saved;
  const signatures = useMemo(() => new Map((saved ? slidesOf(saved) : []).map((slide) => [slide.key, slide.signature])), [saved]);
  const [dragged, setDragged] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const thumbHeight = 92;
  const thumbWidth = Math.round((thumbHeight * width) / height);

  return (
    <div className="flex h-full items-center gap-3 border-t bg-muted/20 px-3">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <Button variant="ghost" size="icon" className="size-7" disabled={current === 0} onClick={() => onChange(current - 1)} aria-label="Diapo précédente">
          <ChevronLeftIcon />
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {current + 1}/{slides.length}
        </span>
        <Button variant="ghost" size="icon" className="size-7" disabled={current >= slides.length - 1} onClick={() => onChange(current + 1)} aria-label="Diapo suivante">
          <ChevronRightIcon />
        </Button>
      </div>
      <ol className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-2">
        {slides.map((slide, index) => (
          <li
            key={slide.key}
            draggable={!lock}
            onDragStart={() => setDragged(index)}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(index);
            }}
            onDragLeave={() => setOver((value) => (value === index ? null : value))}
            onDrop={() => {
              if (dragged !== null && dragged !== index) {
                void actions.slideOps.move(dragged, index);
                onChange(index);
              }
              setDragged(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragged(null);
              setOver(null);
            }}
            className="shrink-0"
          >
            <button
              type="button"
              onClick={() => onChange(index)}
              className={cn(
                "relative block overflow-hidden rounded-md border-2 bg-background transition-all",
                index === current ? "border-primary shadow-raised" : "border-transparent opacity-80 hover:opacity-100",
                over === index && dragged !== index && "border-dashed border-primary/60",
                dragged === index && "opacity-40",
              )}
              style={{ width: thumbWidth, height: thumbHeight }}
              aria-label={slide.label}
            >
              {previewReady && signatures.has(slide.key) && (
                // eslint-disable-next-line @next/next/no-img-element -- frame of the composition from the engine
                <img alt="" src={thumbnailUrl(creation.id, "index.html", slide.time, signatures.get(slide.key))} className="size-full object-cover" draggable={false} />
              )}
              <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-[10px] font-medium tabular-nums">{index + 1}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="flex shrink-0 flex-col gap-1">
        <Button variant="outline" size="sm" disabled={Boolean(lock) || slides.length >= 20} onClick={() => void actions.slideOps.add(current).then(() => onChange(current + 1))}>
          <PlusIcon />
          Nouvelle
        </Button>
        <Button variant="outline" size="sm" disabled={Boolean(lock) || slides.length >= 20} onClick={() => void actions.slideOps.duplicate(current).then(() => onChange(current + 1))}>
          <CopyIcon />
          Dupliquer
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          disabled={Boolean(lock) || slides.length <= 2}
          onClick={() => void actions.slideOps.remove(current).then(() => onChange(Math.max(0, current - 1)))}
        >
          <Trash2Icon />
          Supprimer
        </Button>
      </div>
    </div>
  );
}
