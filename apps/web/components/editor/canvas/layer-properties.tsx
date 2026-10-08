"use client";

import type { Layer } from "@studio/shared/browser";
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon, ArrowDownIcon, ArrowUpIcon, BoldIcon, ImageIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AssetKind } from "@/lib/api";
import { useEditor } from "../editor-context";
import { ColorInput, Field, NumberInput, Section, SliderInput, TextInput, TextPieces, toHex } from "../fields";
import { MediaPanel } from "../media-panel";
import type { CanvasActions } from "./use-canvas-actions";

const FONTS = [
  { value: "inherit", label: "Police du design" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', serif", label: "Times" },
  { value: "'Courier New', monospace", label: "Courier" },
  { value: "Impact, sans-serif", label: "Impact" },
];
const IMAGE_KINDS: AssetKind[] = ["image", "logo"];

type Snapshot = {
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  color: string;
  textAlign: string;
  background: string;
  opacity: number;
  radius: number;
  objectFit: string;
  translate: [number, number];
  width: number;
  height: number;
  zIndex: number;
  /** z-index needs a positioned element. */
  positioned: boolean;
};

/** What the selected layer looks like now, read from the preview (its CSS may come from a stylesheet). */
function useSnapshot(element: () => HTMLElement | null, deps: unknown[]): Snapshot | null {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const read = useRef(element);
  useEffect(() => {
    read.current = element;
  });
  useEffect(() => {
    const take = () => {
      const node = read.current();
      if (!node) return setSnapshot(null);
      const style = node.ownerDocument.defaultView!.getComputedStyle(node);
      const [x = "0", y = "0"] = (node.style.translate || "0 0").split(/\s+/);
      const rect = node.getBoundingClientRect();
      const next: Snapshot = {
        fontSize: Number.parseFloat(style.fontSize) || 16,
        fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
        fontFamily: node.style.fontFamily || "inherit",
        color: toHex(style.color),
        textAlign: style.textAlign === "start" ? "left" : style.textAlign,
        background: toHex(style.backgroundColor === "rgba(0, 0, 0, 0)" ? "" : style.backgroundColor),
        opacity: Number.parseFloat(style.opacity) || 1,
        radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
        objectFit: style.objectFit,
        translate: [Number.parseFloat(x) || 0, Number.parseFloat(y) || 0],
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        zIndex: Number.parseInt(style.zIndex, 10) || 0,
        positioned: style.position !== "static",
      };
      setSnapshot((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    take();
    const timer = window.setInterval(take, 600);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read when the layer or the source changes
  }, deps);
  return snapshot;
}

function layerOrder(snapshot: Snapshot | null, step: number): Record<string, string> {
  const values: Record<string, string> = { "z-index": String((snapshot?.zIndex ?? 0) + step) };
  if (snapshot && !snapshot.positioned) values.position = "relative";
  return values;
}

/** Properties of the selected layer, or of the slide (its background) when nothing is selected. */
export function LayerProperties({
  layer,
  container,
  containerLabel,
  actions,
  textFocus,
}: {
  layer: Layer | null;
  container: { target: Layer["target"]; key: string } | null;
  containerLabel: string;
  actions: CanvasActions;
  textFocus: number;
}) {
  const { files, previewKey, lock } = useEditor();
  const content = files["index.html"]?.content;
  const target = layer?.target ?? container?.target ?? null;
  const snapshot = useSnapshot(() => (target ? actions.element(target) : null), [target?.hfId, target?.id, content, previewKey]);
  const [replacing, setReplacing] = useState(false);
  const textBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textFocus > 0) textBox.current?.querySelector("textarea")?.focus();
  }, [textFocus]);

  if (!layer) {
    return (
      <div>
        <Section title={containerLabel}>
          {container ? (
            <Field label="Couleur de fond">
              <ColorInput value={snapshot?.background || "#ffffff"} onCommit={(value) => void actions.style(container.target, { background: value }, "Couleur de fond")} disabled={Boolean(lock)} />
            </Field>
          ) : (
            <p className="text-xs text-muted-foreground">Chargement…</p>
          )}
        </Section>
        <Section title="Astuces">
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            <li>Clique sur un élément pour le sélectionner, glisse-le pour le déplacer.</li>
            <li>Les poignées le redimensionnent (Maj : garder les proportions).</li>
            <li>Double-clic sur un texte pour le modifier.</li>
          </ul>
        </Section>
      </div>
    );
  }

  const set = (values: Record<string, string | null>, label: string) => void actions.style(layer.target, values, label);
  const position = snapshot?.translate ?? [0, 0];

  return (
    <div>
      <Section title="Calque">
        <Field label="Nom">
          <TextInput value={layer.label} onCommit={(value) => void actions.rename(layer.target, value)} />
        </Field>
      </Section>

      {layer.kind === "text" && (
        <Section title="Texte">
          {layer.variable ? (
            <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              Texte lié à la variable « {layer.variable} » du template : il se change dans les variables de chaque itération.
            </p>
          ) : (
            <div ref={textBox}>
              <Field label="Contenu">
                <TextPieces runs={layer.runs} onCommit={(value, index) => void actions.text(layer.target, value, index)} disabled={Boolean(lock)} />
              </Field>
            </div>
          )}
          <Field label="Police">
            <Select value={FONTS.some((font) => font.value === snapshot?.fontFamily) ? snapshot?.fontFamily : "inherit"} onValueChange={(value) => set({ "font-family": value === "inherit" ? null : value }, "Police")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((font) => (
                  <SelectItem key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Taille">
              <NumberInput value={snapshot?.fontSize ?? 16} min={6} max={800} suffix="px" onCommit={(value) => set({ "font-size": `${value}px` }, "Taille du texte")} />
            </Field>
            <Field label="Couleur">
              <ColorInput value={snapshot?.color ?? "#000000"} onCommit={(value) => set({ color: value }, "Couleur du texte")} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={snapshot?.textAlign ?? "left"}
              onValueChange={(value) => value && set({ "text-align": value }, "Alignement")}
            >
              <ToggleGroupItem value="left" aria-label="À gauche">
                <AlignLeftIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="center" aria-label="Centré">
                <AlignCenterIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="right" aria-label="À droite">
                <AlignRightIcon />
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              variant={snapshot && snapshot.fontWeight >= 600 ? "secondary" : "outline"}
              size="icon-sm"
              aria-label="Gras"
              onClick={() => set({ "font-weight": snapshot && snapshot.fontWeight >= 600 ? "400" : "700" }, "Gras")}
            >
              <BoldIcon />
            </Button>
          </div>
        </Section>
      )}

      {(layer.kind === "image" || layer.kind === "video") && (
        <Section title="Image">
          <Button variant="outline" size="sm" className="w-full" onClick={() => setReplacing((value) => !value)} disabled={Boolean(lock)}>
            <ImageIcon />
            {replacing ? "Fermer" : "Remplacer l'image"}
          </Button>
          {replacing && (
            <div className="-mx-3 max-h-80 overflow-y-auto border-y">
              <MediaPanel
                kinds={IMAGE_KINDS}
                onAdd={async (asset) => {
                  setReplacing(false);
                  await actions.attribute(layer.target, "src", asset.path, "Remplacer l'image");
                }}
              />
            </div>
          )}
          <Field label="Cadrage">
            <ToggleGroup type="single" variant="outline" size="sm" value={snapshot?.objectFit ?? "fill"} onValueChange={(value) => value && set({ "object-fit": value }, "Cadrage")}>
              <ToggleGroupItem value="cover">Remplir</ToggleGroupItem>
              <ToggleGroupItem value="contain">Ajuster</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </Section>
      )}

      {layer.kind === "shape" && (
        <Section title="Forme">
          <Field label="Couleur">
            <ColorInput value={snapshot?.background || "#000000"} onCommit={(value) => set({ background: value }, "Couleur de la forme")} />
          </Field>
        </Section>
      )}

      <Section title="Apparence">
        <Field label="Opacité">
          <SliderInput value={snapshot?.opacity ?? 1} onCommit={(value) => set({ opacity: String(value) }, "Opacité")} format={(value) => `${Math.round(value * 100)} %`} />
        </Field>
        <Field label="Arrondi des coins">
          <NumberInput value={snapshot?.radius ?? 0} min={0} max={2000} suffix="px" onCommit={(value) => set({ "border-radius": `${value}px` }, "Arrondi")} />
        </Field>
      </Section>

      <Section title="Position et taille">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Décalage X">
            <NumberInput value={position[0]} suffix="px" onCommit={(value) => set({ translate: `${value}px ${position[1]}px` }, "Position")} />
          </Field>
          <Field label="Décalage Y">
            <NumberInput value={position[1]} suffix="px" onCommit={(value) => set({ translate: `${position[0]}px ${value}px` }, "Position")} />
          </Field>
          <Field label="Largeur">
            <NumberInput value={snapshot?.width ?? 0} min={1} suffix="px" onCommit={(value) => set({ width: `${value}px` }, "Largeur")} />
          </Field>
          <Field label="Hauteur">
            <NumberInput value={snapshot?.height ?? 0} min={1} suffix="px" onCommit={(value) => set({ height: `${value}px` }, "Hauteur")} disabled={layer.kind === "text"} />
          </Field>
        </div>
      </Section>

      <Section title="Disposition">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => set(layerOrder(snapshot, 1), "Mettre devant")}>
            <ArrowUpIcon />
            Devant
          </Button>
          <Button variant="outline" size="sm" onClick={() => set(layerOrder(snapshot, -1), "Mettre derrière")}>
            <ArrowDownIcon />
            Derrière
          </Button>
        </div>
        <Button variant="outline" size="sm" className="w-full text-destructive" onClick={() => void actions.remove(layer.target)} disabled={Boolean(lock)}>
          <Trash2Icon />
          Supprimer le calque
        </Button>
      </Section>
    </div>
  );
}
