"use client";

import type { Layer } from "@studio/shared/browser";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useEditor } from "../editor-context";
import type { CanvasActions } from "./use-canvas-actions";

export type Tool = "select" | "text" | "rect" | "ellipse";

type Box = { x: number; y: number; width: number; height: number };
type Handle = "nw" | "ne" | "sw" | "se" | "e" | "w";
type Drag = {
  layer: Layer;
  element: HTMLElement;
  mode: "move" | Handle;
  originX: number;
  originY: number;
  translate: [number, number];
  box: Box;
  moved: boolean;
};

const HANDLES: Handle[] = ["nw", "ne", "sw", "se", "e", "w"];
const HANDLE_POSITION: Record<Handle, string> = {
  nw: "-left-1.5 -top-1.5 cursor-nwse-resize",
  ne: "-right-1.5 -top-1.5 cursor-nesw-resize",
  sw: "-left-1.5 -bottom-1.5 cursor-nesw-resize",
  se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
  e: "-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize",
  w: "-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize",
};

function parseTranslate(value: string): [number, number] {
  const [x = "0", y = "0"] = value.trim().split(/\s+/);
  return [Number.parseFloat(x) || 0, Number.parseFloat(y) || 0];
}

const round = (value: number) => Math.round(value);

/**
 * What is drawn over the canvas: the hovered layer's outline, the selected layer's frame and handles. Dragging
 * moves a layer (CSS `translate`, apart from GSAP's `transform`), the handles resize it; the preview follows live
 * and the source is patched when the pointer is released.
 */
export function CanvasOverlay({
  scale,
  layers,
  selected,
  onSelect,
  tool,
  onPlace,
  onEditText,
  actions,
}: {
  scale: number;
  layers: Layer[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  tool: Tool;
  onPlace: (x: number, y: number) => void;
  onEditText: () => void;
  actions: CanvasActions;
}) {
  const { previewDocument, lock, previewKey } = useEditor();
  const surface = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const drag = useRef<Drag | null>(null);
  const layerMap = useMemo(() => new Map(layers.map((layer) => [layer.key, layer])), [layers]);
  const byKey = useRef(layerMap);
  useEffect(() => {
    byKey.current = layerMap;
  }, [layerMap]);

  // Frames follow the live DOM (fonts loading, animations settling, a drag in progress).
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const next: Record<string, Box> = {};
      for (const key of [selected, hovered]) {
        const layer = key ? byKey.current.get(key) : null;
        const element = layer ? actions.element(layer.target) : null;
        if (!key || !element) continue;
        const rect = element.getBoundingClientRect();
        next[key] = { x: rect.left * scale, y: rect.top * scale, width: rect.width * scale, height: rect.height * scale };
      }
      setBoxes((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [selected, hovered, scale, actions, previewKey, layerMap]);

  const point = (event: React.PointerEvent) => {
    const rect = surface.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };

  /** The front-most layer under the pointer. */
  function hit(x: number, y: number): Layer | null {
    const document = previewDocument();
    if (!document) return null;
    for (const element of document.elementsFromPoint(x, y)) {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const key = node.getAttribute("data-hf-id");
        const layer = key ? byKey.current.get(key) : null;
        if (layer && !layer.hidden) return layer;
      }
    }
    return null;
  }

  function begin(event: React.PointerEvent, layer: Layer, mode: Drag["mode"]) {
    const element = actions.element(layer.target);
    if (!element || lock) return;
    event.stopPropagation();
    surface.current!.setPointerCapture(event.pointerId);
    const rect = element.getBoundingClientRect();
    drag.current = {
      layer,
      element,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      translate: parseTranslate(element.style.translate),
      box: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      moved: false,
    };
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    const { x, y } = point(event);
    if (tool !== "select") {
      onPlace(x, y);
      return;
    }
    const layer = hit(x, y);
    onSelect(layer?.key ?? null);
    if (layer) begin(event, layer, "move");
  }

  function onPointerMove(event: React.PointerEvent) {
    const current = drag.current;
    if (!current) {
      if (tool === "select") {
        const { x, y } = point(event);
        setHovered(hit(x, y)?.key ?? null);
      }
      return;
    }
    const dx = (event.clientX - current.originX) / scale;
    const dy = (event.clientY - current.originY) / scale;
    if (!current.moved && Math.hypot(dx, dy) * scale < 3) return;
    current.moved = true;
    const { element, translate, box, mode, layer } = current;
    if (mode === "move") {
      element.style.translate = `${round(translate[0] + dx)}px ${round(translate[1] + dy)}px`;
      return;
    }
    const keepRatio = layer.kind === "image" || layer.kind === "video" || event.shiftKey;
    const fromLeft = mode === "nw" || mode === "sw" || mode === "w";
    const fromTop = mode === "nw" || mode === "ne";
    let width = Math.max(8, box.width + (fromLeft ? -dx : dx));
    let height = mode === "e" || mode === "w" ? box.height : Math.max(8, box.height + (fromTop ? -dy : dy));
    if (keepRatio && mode !== "e" && mode !== "w") {
      const ratio = box.width / box.height;
      if (width / height > ratio) height = width / ratio;
      else width = height * ratio;
    }
    element.style.width = `${round(width)}px`;
    if (mode !== "e" && mode !== "w" && layer.kind !== "text") element.style.height = `${round(height)}px`;
    element.style.translate = `${round(translate[0] + (fromLeft ? box.width - width : 0))}px ${round(translate[1] + (fromTop ? box.height - height : 0))}px`;
  }

  function onPointerUp() {
    const current = drag.current;
    drag.current = null;
    if (!current?.moved) return;
    const { element, layer, mode } = current;
    const values: Record<string, string | null> = { translate: element.style.translate || null };
    if (mode !== "move") {
      values.width = element.style.width || null;
      if (element.style.height && layer.kind !== "text") values.height = element.style.height;
    }
    void actions.style(layer.target, values, mode === "move" ? `Déplacer « ${layer.label} »` : `Redimensionner « ${layer.label} »`);
  }

  const selectedBox = selected ? boxes[selected] : null;
  const hoveredBox = hovered && hovered !== selected ? boxes[hovered] : null;
  const selectedLayer = selected ? layerMap.get(selected) : null;

  return (
    <div
      ref={surface}
      className={cn("absolute inset-0 touch-none", tool === "select" ? "cursor-default" : "cursor-crosshair")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => !drag.current && setHovered(null)}
      onDoubleClick={() => selectedLayer?.kind === "text" && onEditText()}
    >
      {hoveredBox && (
        <div className="pointer-events-none absolute outline outline-1 outline-primary/70" style={{ left: hoveredBox.x, top: hoveredBox.y, width: hoveredBox.width, height: hoveredBox.height }} />
      )}
      {selectedBox && selectedLayer && (
        <div className="pointer-events-none absolute outline outline-2 outline-primary" style={{ left: selectedBox.x, top: selectedBox.y, width: selectedBox.width, height: selectedBox.height }}>
          <span className="absolute -top-6 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-primary-foreground">
            {selectedLayer.label}
          </span>
          {!lock &&
            HANDLES.filter((handle) => selectedLayer.kind !== "text" || handle === "e" || handle === "w").map((handle) => (
              <span
                key={handle}
                className={cn("pointer-events-auto absolute size-3 rounded-[3px] border-2 border-primary bg-background", HANDLE_POSITION[handle])}
                onPointerDown={(event) => begin(event, selectedLayer, handle)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
