import {
  applyEdits,
  byHfId,
  escapeHtml,
  findAll,
  findFirst,
  hasOwnText,
  mintHfId,
  outerHtml,
  parseHtml,
  setAttributesEdit,
  textOf,
  textRuns,
  uniqueId,
  usedIds,
  walk,
  type HtmlNode,
  type SourceEdit,
} from "./html-tree";
import { humanize, keyOf, labelOf, rootOf, round, targetOf, type ElementTarget } from "./timeline";

/** Inline `style` as a map, in authored order. */
export function parseStyle(style: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const declaration of (style ?? "").split(";")) {
    const at = declaration.indexOf(":");
    if (at <= 0) continue;
    map.set(declaration.slice(0, at).trim().toLowerCase(), declaration.slice(at + 1).trim());
  }
  return map;
}

export type Slide = {
  index: number;
  key: string;
  target: ElementTarget;
  label: string;
  /** Capture time of the slide (its start + 0.5 s). */
  time: number;
  /** Changes when the slide's markup or place changes: its thumbnail is asked again only then. */
  signature: string;
};

/** A text split word by word (each word its own element, to animate them): edited as one sentence. */
export function isWordSplit(runs: string[]): boolean {
  return runs.length > 1 && runs.every((run) => !/\s/.test(run));
}

/** A short FNV-1a hash, enough to tell two versions of a slide apart. */
export function signatureOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

const SLIDE_LENGTH = 1;

/** The full-frame clips of a carousel's root, one per second, in time order. */
function slideNodes(document: HtmlNode): HtmlNode[] {
  const root = rootOf(document);
  if (!root) return [];
  return root.children
    .filter((node) => node.attrs["data-start"] !== undefined && Number.parseFloat(node.attrs["data-duration"] ?? "1") <= SLIDE_LENGTH + 0.01)
    .sort((a, b) => Number.parseFloat(a.attrs["data-start"]) - Number.parseFloat(b.attrs["data-start"]));
}

export function slidesOf(html: string): Slide[] {
  const document = parseHtml(html);
  const styles = findAll(document, (node) => node.tag === "style")
    .map((node) => html.slice(node.openEnd, node.closeStart))
    .join("");
  return slideNodes(document).map((node, index) => ({
    index,
    key: keyOf(node),
    target: targetOf(node),
    label: node.attrs["data-layer"]?.trim() || `Diapo ${index + 1}`,
    time: index + 0.5,
    signature: signatureOf(`${index}${styles}${outerHtml(html, node)}`),
  }));
}

/**
 * Rewrites the timing of a carousel after its slides changed: slide `i` of `order` starts at `i` (`null` stands
 * for a new slide, written with its timing), the root and any clip running the whole carousel (a background) last
 * as many seconds as there are slides.
 */
function retimeSlides(html: string, document: HtmlNode, order: Array<HtmlNode | null>, previousCount: number): SourceEdit[] {
  const root = rootOf(document)!;
  const count = String(order.length);
  const edits: SourceEdit[] = [];
  order.forEach((node, index) => {
    if (node && Number.parseFloat(node.attrs["data-start"]) !== index) edits.push(setAttributesEdit(html, node, { "data-start": String(index) }));
  });
  edits.push(setAttributesEdit(html, root, { "data-duration": count }));
  const slides = new Set(order);
  walk(root, (node) => {
    if (node.attrs["data-start"] === undefined) return;
    if (!slides.has(node)) {
      const spans = Number.parseFloat(node.attrs["data-start"]) === 0 && Math.abs(Number.parseFloat(node.attrs["data-duration"] ?? "0") - previousCount) < 0.01;
      if (spans) edits.push(setAttributesEdit(html, node, { "data-duration": count }));
    }
    return false;
  });
  return edits;
}

/** Copies the CSS rules of `#from` (in every `<style>`) for `#to`, so a copied element keeps its look. */
export function duplicateIdRules(html: string, document: HtmlNode, renamed: Map<string, string>): SourceEdit[] {
  if (renamed.size === 0) return [];
  const edits: SourceEdit[] = [];
  for (const style of findAll(document, (node) => node.tag === "style")) {
    const css = html.slice(style.openEnd, style.closeStart);
    const added: string[] = [];
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = rule[1].trim();
      if (selectors.startsWith("@")) continue;
      let copy = selectors;
      for (const [from, to] of renamed) copy = copy.replace(new RegExp(`#${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "g"), `#${to}`);
      if (copy !== selectors) added.push(`${copy} {${rule[2]}}`);
    }
    if (added.length) edits.push({ from: style.closeStart, to: style.closeStart, text: `\n      ${added.join("\n      ")}\n    ` });
  }
  return edits;
}

/**
 * A copy of an element with new ids (and new `data-hf-id`s) all the way down; its root always gets a `data-hf-id`,
 * so the editor can find it.
 */
export function cloneElement(html: string, node: HtmlNode, taken: Set<string>): { markup: string; renamed: Map<string, string>; rootHfId: string } {
  const renamed = new Map<string, string>();
  const edits: SourceEdit[] = [];
  const rootHfId = mintHfId(taken);
  const visit = (current: HtmlNode) => {
    const values: Record<string, string | null> = {};
    if (current.attrs.id) {
      const id = uniqueId(`${current.attrs.id}-copie`, taken);
      renamed.set(current.attrs.id, id);
      values.id = id;
    }
    if (current === node) values["data-hf-id"] = rootHfId;
    else if (current.attrs["data-hf-id"]) values["data-hf-id"] = mintHfId(taken);
    if (Object.keys(values).length) edits.push(setAttributesEdit(html, current, values));
    current.children.forEach(visit);
  };
  visit(node);
  const shifted = edits.map((edit) => ({ ...edit, from: edit.from - node.start, to: edit.to - node.start }));
  return { markup: applyEdits(outerHtml(html, node), shifted), renamed, rootHfId };
}

export function duplicateSlide(html: string, index: number): string {
  const document = parseHtml(html);
  const slides = slideNodes(document);
  const source = slides[index];
  if (!source) return html;
  const { markup, renamed } = cloneElement(html, source, usedIds(document));
  const copy = markup
    .replace(/(\sdata-start=)"[^"]*"/, `$1"${index + 1}"`)
    .replace(/(\sdata-layer=)"([^"]*)"/, (_, name: string, label: string) => `${name}"${label} (copie)"`);
  const order: Array<HtmlNode | null> = [...slides];
  order.splice(index + 1, 0, null);
  return applyEdits(html, [
    ...retimeSlides(html, document, order, slides.length),
    { from: source.end, to: source.end, text: `\n      ${copy}` },
    ...duplicateIdRules(html, document, renamed),
  ]);
}

export function removeSlide(html: string, index: number): string {
  const document = parseHtml(html);
  const slides = slideNodes(document);
  const removed = slides[index];
  if (!removed || slides.length <= 1) return html;
  // Swallow the indentation and line break before the removed slide, so no blank line is left.
  let from = removed.start;
  while (from > 0 && /[ \t]/.test(html[from - 1])) from--;
  if (html[from - 1] === "\n") from--;
  return applyEdits(html, [
    ...retimeSlides(
      html,
      document,
      slides.filter((node) => node !== removed),
      slides.length,
    ),
    { from, to: removed.end, text: "" },
  ]);
}

/** Moves slide `from` to position `to`: only the timing changes, the markup stays in place. */
export function moveSlide(html: string, from: number, to: number): string {
  const document = parseHtml(html);
  const slides = slideNodes(document);
  if (!slides[from] || to < 0 || to >= slides.length || from === to) return html;
  const order = [...slides];
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  return applyEdits(html, retimeSlides(html, document, order, slides.length));
}

/** A new empty slide after `index`, with the tag, classes and track of its neighbour and a white background. */
export function addSlide(html: string, index: number, random: () => number = Math.random): string {
  const document = parseHtml(html);
  const root = rootOf(document);
  if (!root) return html;
  const slides = slideNodes(document);
  const reference = slides[Math.min(index, slides.length - 1)];
  const position = Math.min(index + 1, slides.length);
  const taken = usedIds(document);
  const tag = reference?.tag ?? "section";
  const markup =
    `<${tag} data-hf-id="${mintHfId(taken, random)}" id="${uniqueId(`diapo-${position + 1}`, taken)}" class="${escapeHtml(reference?.attrs.class ?? "clip")}" ` +
    `data-start="${position}" data-duration="1" data-track-index="${escapeHtml(reference?.attrs["data-track-index"] ?? "0")}" ` +
    `data-layer="Diapo ${position + 1}" style="position: absolute; inset: 0; background: #ffffff;"></${tag}>`;
  const order: Array<HtmlNode | null> = [...slides];
  order.splice(position, 0, null);
  const anchor = reference ? reference.end : root.closeStart;
  return applyEdits(html, [...retimeSlides(html, document, order, slides.length), { from: anchor, to: anchor, text: `\n      ${markup}` }]);
}

export type LayerKind = "text" | "image" | "video" | "shape" | "group";

export type Layer = {
  key: string;
  target: ElementTarget;
  tag: string;
  kind: LayerKind;
  label: string;
  depth: number;
  text: string;
  /** The pieces of a text (`textRuns`): more than one when parts of it are styled apart. */
  runs: string[];
  hidden: boolean;
  /** Named by Claude or the user (`data-layer`). */
  named: boolean;
  /** Template variable bound to the layer's text or image (`data-var-text`, `data-var-src`): edited as a variable. */
  variable: string | null;
};

const SKIPPED = new Set(["script", "style", "template", "br", "source", "track", "meta", "link", "audio"]);
const MEDIA = new Set(["img", "svg", "picture", "video", "canvas"]);

function layerKind(html: string, node: HtmlNode): LayerKind {
  if (node.tag === "video") return "video";
  if (MEDIA.has(node.tag)) return "image";
  if (node.attrs["data-var-text"] !== undefined || hasOwnText(html, node)) return "text";
  return node.children.some((child) => !SKIPPED.has(child.tag)) ? "group" : "shape";
}

/**
 * The layers of a slide (or of an image's root), front-most last as in the source: every named element
 * (`data-layer`), else the visible leaves (texts, images, empty shapes), groups only when named.
 */
export function layersOf(html: string, containerKey?: string | null): Layer[] {
  const document = parseHtml(html);
  const container = containerKey ? (byHfId(document, containerKey) ?? findFirst(document, (node) => node.attrs.id === containerKey)) : rootOf(document);
  if (!container) return [];
  const layers: Layer[] = [];
  const visit = (node: HtmlNode, depth: number) => {
    for (const child of node.children) {
      if (SKIPPED.has(child.tag)) continue;
      const kind = layerKind(html, child);
      const named = Boolean(child.attrs["data-layer"]?.trim());
      const leaf = kind !== "group" || MEDIA.has(child.tag);
      if (named || leaf) {
        layers.push({
          key: keyOf(child),
          target: targetOf(child),
          tag: child.tag,
          kind,
          label: child.attrs["data-var-text"] && !named && !textOf(html, child) ? humanize(child.attrs.id ?? child.attrs["data-var-text"]) : labelOf(html, child, kind === "text" ? "text" : kind === "image" ? "image" : "element"),
          depth,
          text: kind === "text" ? textOf(html, child) : "",
          runs: kind === "text" ? textRuns(html, child).map((run) => run.text) : [],
          hidden: /hidden/.test(parseStyle(child.attrs.style).get("visibility") ?? "") || /none/.test(parseStyle(child.attrs.style).get("display") ?? ""),
          named,
          variable: child.attrs["data-var-text"] ?? child.attrs["data-var-src"] ?? null,
        });
      }
      // Inside a text or a picture, children are part of it (a <span> of a title, the <path>s of an icon).
      if (kind === "group" && !MEDIA.has(child.tag)) visit(child, named ? depth + 1 : depth);
    }
  };
  visit(container, 0);
  return layers;
}

export type NewElement =
  | { kind: "text"; text: string; label?: string; fontFamily?: string; color?: string }
  | { kind: "image"; src: string; label?: string; width?: number; height?: number }
  | { kind: "shape"; shape: "rect" | "ellipse"; color: string; label?: string }
  | { kind: "video"; src: string; label?: string }
  | { kind: "audio"; src: string; label?: string; voice?: boolean };

export type Placement = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Timing, for an element added to a video. */
  start?: number;
  duration?: number;
  track?: number;
};

/** The markup of an element added from the editor: absolutely placed, named, with its own `data-hf-id`. */
export function elementMarkup(element: NewElement, placement: Placement, hfId: string): string {
  const timing =
    placement.start !== undefined
      ? ` class="clip" data-start="${round(placement.start)}" data-duration="${round(placement.duration ?? 3)}" data-track-index="${placement.track ?? 0}"`
      : "";
  const box = [
    "position: absolute",
    `left: ${Math.round(placement.x)}px`,
    `top: ${Math.round(placement.y)}px`,
    placement.width !== undefined ? `width: ${Math.round(placement.width)}px` : null,
    placement.height !== undefined ? `height: ${Math.round(placement.height)}px` : null,
    "z-index: 10",
  ].filter(Boolean);
  const label = (fallback: string) => escapeHtml(element.label?.trim() || fallback);
  switch (element.kind) {
    case "text":
      return `<div data-hf-id="${hfId}" data-layer="${label("Texte")}"${timing} style="${[
        ...box,
        element.fontFamily ? `font-family: ${element.fontFamily.replace(/"/g, "'")}` : null,
        "font-size: 72px",
        "font-weight: 700",
        "line-height: 1.1",
        `color: ${element.color ?? "#111111"}`,
      ]
        .filter(Boolean)
        .join("; ")};">${escapeHtml(element.text)}</div>`;
    case "image":
      return `<img data-hf-id="${hfId}" data-layer="${label("Image")}"${timing} src="${escapeHtml(element.src)}" alt="" style="${[...box, "object-fit: cover"].join("; ")};">`;
    case "shape":
      return `<div data-hf-id="${hfId}" data-layer="${label(element.shape === "ellipse" ? "Cercle" : "Rectangle")}"${timing} style="${[...box, `background: ${element.color}`, element.shape === "ellipse" ? "border-radius: 50%" : "border-radius: 0"].join("; ")};"></div>`;
    case "video":
      return `<video data-hf-id="${hfId}" data-layer="${label("Vidéo")}"${timing} src="${escapeHtml(element.src)}" muted playsinline style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;"></video>`;
    case "audio":
      return `<audio data-hf-id="${hfId}" data-layer="${label(element.voice ? "Voix" : "Musique")}"${timing} src="${escapeHtml(element.src)}" data-volume="${element.voice ? 1 : 0.3}"></audio>`;
  }
}

/** Adds an element at the end of a container (a slide, or the root by default). Returns the source and its key. */
export function insertElement(
  html: string,
  element: NewElement,
  placement: Placement,
  containerKey?: string | null,
  random: () => number = Math.random,
): { html: string; key: string } {
  const document = parseHtml(html);
  const container = containerKey ? byHfId(document, containerKey) : rootOf(document);
  if (!container) return { html, key: "" };
  const hfId = mintHfId(usedIds(document), random);
  const markup = elementMarkup(element, placement, hfId);
  return { html: applyEdits(html, [{ from: container.closeStart, to: container.closeStart, text: `  ${markup}\n    ` }]), key: hfId };
}

/** The highest `data-track-index` in use, to put an added clip on a track of its own. */
export function nextTrack(html: string): number {
  let highest = -1;
  walk(parseHtml(html), (node) => {
    const track = Number.parseInt(node.attrs["data-track-index"] ?? "", 10);
    if (Number.isFinite(track)) highest = Math.max(highest, track);
  });
  return highest + 1;
}

/** Text of an element as the source has it, for the inspector. */
export function elementText(html: string, key: string): string {
  const node = byHfId(parseHtml(html), key);
  return node ? textOf(html, node) : "";
}

export function elementAttributes(html: string, key: string): Record<string, string> | null {
  return byHfId(parseHtml(html), key)?.attrs ?? null;
}
