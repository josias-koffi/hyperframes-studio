"use client";

import { layersOf, STILL_TIME } from "@studio/shared/browser";
import { CircleIcon, ImageIcon, LayersIcon, MousePointer2Icon, SquareIcon, TypeIcon, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AssetKind } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useEditor } from "../editor-context";
import { toHex } from "../fields";
import { SidePanel } from "../editor-shell";
import { MediaPanel, type ImportedAsset } from "../media-panel";
import { Preview } from "../preview";
import { CanvasOverlay, type Tool } from "./canvas-overlay";
import { Filmstrip } from "./filmstrip";
import { LayerProperties } from "./layer-properties";
import { LayersPanel } from "./layers-panel";
import { INDEX, useCanvasActions } from "./use-canvas-actions";

const MEDIA_KINDS: AssetKind[] = ["image", "logo"];
const TOOLS: { id: Tool; label: string; icon: LucideIcon; key: string }[] = [
  { id: "select", label: "Sélection", icon: MousePointer2Icon, key: "v" },
  { id: "text", label: "Texte", icon: TypeIcon, key: "t" },
  { id: "rect", label: "Rectangle", icon: SquareIcon, key: "r" },
  { id: "ellipse", label: "Cercle", icon: CircleIcon, key: "e" },
];

/**
 * The image and carousel editor, a simplified image editor: tools and layers on the left, the canvas in the
 * middle, the properties (and Claude) on the right, the slides below for a carousel.
 */
export function CanvasEditor() {
  const { creation, load, files, lock } = useEditor();
  const actions = useCanvasActions();
  const { composition, slides } = actions;
  const [slideIndex, setSlideIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [scale, setScale] = useState(1);
  const [leftTab, setLeftTab] = useState("layers");
  const [textFocus, setTextFocus] = useState(0);

  const carousel = creation.type === "carousel";
  const currentIndex = Math.max(0, Math.min(slideIndex, slides.length - 1));
  const slide = carousel ? (slides[currentIndex] ?? null) : null;
  const containerKey = slide?.key ?? composition?.rootKey ?? null;
  const source = files[INDEX]?.content ?? "";
  const layers = useMemo(() => (source ? layersOf(source, slide?.key ?? null) : []), [source, slide?.key]);
  const layer = layers.find((candidate) => candidate.key === selected) ?? null;

  useEffect(() => {
    void load(INDEX);
  }, [load]);

  const changeSlide = useCallback((index: number) => {
    setSlideIndex(index);
    setSelected(null);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const shortcut = TOOLS.find((candidate) => candidate.key === event.key.toLowerCase());
      if (shortcut) return setTool(shortcut.id);
      if (event.key === "Escape") return (setSelected(null), setTool("select"));
      if (layer && !lock && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        void actions.remove(layer.target);
      }
      if (layer && !lock && event.key.startsWith("Arrow")) {
        event.preventDefault();
        const element = actions.element(layer.target);
        const [x = "0", y = "0"] = (element?.style.translate || "0 0").split(/\s+/);
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        void actions.style(layer.target, { translate: `${(Number.parseFloat(x) || 0) + dx}px ${(Number.parseFloat(y) || 0) + dy}px` }, "Déplacer");
      }
      if (carousel && !layer && (event.key === "PageDown" || event.key === "PageUp")) {
        changeSlide(Math.max(0, Math.min(slides.length - 1, currentIndex + (event.key === "PageDown" ? 1 : -1))));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, carousel, changeSlide, layer, lock, currentIndex, slides.length]);

  if (!composition || !files[INDEX]) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  const { width, height } = composition;
  const holdAt = slide ? slide.time : STILL_TIME;

  async function place(x: number, y: number) {
    const placeTool = tool;
    setTool("select");
    if (placeTool === "text") {
      // The new text takes the font and colour of the création's first text, so it looks like it belongs.
      const reference = layers.find((candidate) => candidate.kind === "text");
      const element = reference ? actions.element(reference.target) : null;
      const style = element ? element.ownerDocument.defaultView!.getComputedStyle(element) : null;
      const key = await actions.insert({ kind: "text", text: "Votre texte", fontFamily: style?.fontFamily, color: style ? toHex(style.color) : undefined }, { x, y: y - 40, width: Math.min(width * 0.7, width - x) }, slide?.key ?? null);
      if (key) setSelected(key);
    } else if (placeTool === "rect" || placeTool === "ellipse") {
      const size = Math.round(Math.min(width, height) * 0.25);
      const key = await actions.insert({ kind: "shape", shape: placeTool, color: "#5b4bff" }, { x: x - size / 2, y: y - size / 2, width: size, height: size }, slide?.key ?? null);
      if (key) setSelected(key);
    }
  }

  async function addImage(asset: ImportedAsset) {
    const size = Math.round(Math.min(width, height) * 0.5);
    const key = await actions.insert(
      { kind: "image", src: asset.path, label: asset.filename.replace(/\.[^.]+$/, "") },
      { x: (width - size) / 2, y: (height - size) / 2, width: size, height: size },
      slide?.key ?? null,
    );
    if (key) {
      setSelected(key);
      setLeftTab("layers");
    }
  }

  const context = [slide ? `diapo ${currentIndex + 1}` : null, layer ? `calque « ${layer.label} » (${layer.kind}, ${layer.tag})` : null].filter(Boolean).join(", ") || null;

  return (
    <div className={cn("grid h-full min-h-0 grid-cols-[3.25rem_15rem_minmax(0,1fr)_19rem]", carousel ? "grid-rows-[minmax(0,1fr)_8.5rem]" : "grid-rows-[minmax(0,1fr)]")}>
      <nav className="row-span-2 flex flex-col items-center gap-1 border-r py-2" aria-label="Outils">
        {TOOLS.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={item.label}
                aria-pressed={tool === item.id}
                disabled={Boolean(lock) && item.id !== "select"}
                onClick={() => setTool(item.id)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
                  tool === item.id && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                )}
              >
                <item.icon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {item.label} ({item.key.toUpperCase()})
            </TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Image"
              disabled={Boolean(lock)}
              onClick={() => setLeftTab("media")}
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <ImageIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Image</TooltipContent>
        </Tooltip>
      </nav>

      <aside className="row-span-2 min-h-0 border-r">
        <Tabs value={leftTab} onValueChange={setLeftTab} className="flex h-full min-h-0 flex-col gap-0">
          <TabsList className="m-2 grid w-auto grid-cols-2">
            <TabsTrigger value="layers">
              <LayersIcon />
              Calques
            </TabsTrigger>
            <TabsTrigger value="media">
              <ImageIcon />
              Médias
            </TabsTrigger>
          </TabsList>
          <TabsContent value="layers" className="min-h-0 flex-1 overflow-y-auto">
            <LayersPanel layers={layers} selected={layer?.key ?? null} onSelect={setSelected} actions={actions} />
          </TabsContent>
          <TabsContent value="media" className="min-h-0 flex-1 overflow-y-auto">
            <MediaPanel kinds={MEDIA_KINDS} onAdd={addImage} />
          </TabsContent>
        </Tabs>
      </aside>

      <section className="min-h-0 bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)] bg-[length:24px_24px]">
        <Preview width={width} height={height} holdAt={holdAt} onScale={setScale} className="h-full p-8">
          <CanvasOverlay
            scale={scale}
            layers={layers}
            selected={layer?.key ?? null}
            onSelect={setSelected}
            tool={tool}
            onPlace={(x, y) => void place(x, y)}
            onEditText={() => setTextFocus((value) => value + 1)}
            actions={actions}
          />
        </Preview>
      </section>

      <aside className="row-span-2 min-h-0 border-l">
        <SidePanel
          context={context}
          properties={
            <LayerProperties
              layer={layer}
              container={containerKey ? { key: containerKey, target: slide?.target ?? composition.root ?? { hfId: containerKey } } : null}
              containerLabel={slide ? slide.label : "Image"}
              actions={actions}
              textFocus={textFocus}
            />
          }
        />
      </aside>

      {carousel && (
        <div className="col-start-3 min-h-0">
          <Filmstrip slides={slides} current={currentIndex} onChange={changeSlide} width={width} height={height} actions={actions} />
        </div>
      )}
    </div>
  );
}
