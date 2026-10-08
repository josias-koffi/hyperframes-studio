"use client";

import type { Layer, LayerKind } from "@studio/shared/browser";
import { EyeIcon, EyeOffIcon, FilmIcon, ImageIcon, LayersIcon, SquareIcon, TypeIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasActions } from "./use-canvas-actions";

const ICONS: Record<LayerKind, LucideIcon> = { text: TypeIcon, image: ImageIcon, video: FilmIcon, shape: SquareIcon, group: LayersIcon };

/** The layers of the slide, front-most first as in any image editor. */
export function LayersPanel({ layers, selected, onSelect, actions }: { layers: Layer[]; selected: string | null; onSelect: (key: string) => void; actions: CanvasActions }) {
  if (layers.length === 0) return <p className="p-3 text-xs text-muted-foreground">Aucun calque sur cette diapo.</p>;
  return (
    <ul className="space-y-0.5 p-2">
      {[...layers].reverse().map((layer) => {
        const Icon = ICONS[layer.kind];
        return (
          <li key={layer.key}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(layer.key)}
              onKeyDown={(event) => event.key === "Enter" && onSelect(layer.key)}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                selected === layer.key && "bg-primary/10 text-primary hover:bg-primary/15",
                layer.hidden && "opacity-50",
              )}
              style={{ paddingLeft: 8 + layer.depth * 12 }}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{layer.label}</span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                aria-label={layer.hidden ? "Afficher" : "Masquer"}
                onClick={(event) => {
                  event.stopPropagation();
                  void actions.style(layer.target, { visibility: layer.hidden ? null : "hidden" }, layer.hidden ? "Afficher le calque" : "Masquer le calque");
                }}
              >
                {layer.hidden ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
