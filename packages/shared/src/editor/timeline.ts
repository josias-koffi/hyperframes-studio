import { findFirst, hasOwnText, parseHtml, textOf, walk, type HtmlNode } from "./html-tree";

/** What a clip is, as the editor shows it. */
export type ClipKind = "video" | "scene" | "image" | "text" | "element" | "captions" | "voice" | "music";

/** The simplified tracks of the timeline, top to bottom; the composition's own `data-track-index` is kept as is. */
export const LANES = [
  { id: "video", label: "Vidéo" },
  { id: "scenes", label: "Scènes" },
  { id: "overlays", label: "Textes & images" },
  { id: "captions", label: "Sous-titres" },
  { id: "voice", label: "Voix" },
  { id: "music", label: "Musique" },
] as const;
export type LaneId = (typeof LANES)[number]["id"];

const LANE_OF: Record<ClipKind, LaneId> = {
  video: "video",
  scene: "scenes",
  image: "overlays",
  text: "overlays",
  element: "overlays",
  captions: "captions",
  voice: "voice",
  music: "music",
};

/** A patch target the engine understands (`file-mutations/patch-element`). */
export type ElementTarget = { hfId?: string; id?: string };

export type Clip = {
  target: ElementTarget;
  /** Stable key for the UI: the `data-hf-id`, else the id, else the source offset. */
  key: string;
  id: string | null;
  tag: string;
  kind: ClipKind;
  lane: LaneId;
  label: string;
  start: number;
  duration: number;
  /** The authored `data-duration` is missing: the clip lasts until the end of the composition. */
  open: boolean;
  /** `data-track-index` of the source. */
  track: number;
  src: string | null;
  /** Sub-composition file of a scene (`data-composition-src`). */
  compositionSrc: string | null;
  volume: number | null;
  /** Where the media starts playing, in seconds of the source file. */
  mediaStart: number;
  /** Name of the attribute holding `mediaStart`. */
  mediaStartAttr: "data-playback-start" | "data-media-start";
  text: string;
  /** Template variable bound to the clip's text or image (`data-var-text`, `data-var-src`). */
  variable: string | null;
};

export type Composition = {
  root: ElementTarget | null;
  rootKey: string | null;
  width: number;
  height: number;
  duration: number;
  clips: Clip[];
};

const number = (value: string | undefined, fallback: number) => {
  const parsed = value === undefined ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const round = (value: number) => Math.round(value * 1000) / 1000;

function fileName(src: string): string {
  return decodeURIComponent(src.split(/[?#]/)[0].split("/").pop() ?? src);
}

/** `el-02-brief` → « Brief », `title-main` → « Title main ». */
export function humanize(id: string): string {
  const words = id
    .replace(/^el[-_]/, "")
    .replace(/^\d+[-_]/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

function kindOf(html: string, node: HtmlNode): ClipKind {
  const attrs = node.attrs;
  const name = `${attrs.id ?? ""} ${attrs.class ?? ""} ${attrs.src ?? ""}`.toLowerCase();
  if (attrs["data-track-kind"] === "captions" || /caption|sous-titre|subtitle/.test(name)) return "captions";
  if (node.tag === "audio") return /voice|voix|narration|\bvo\b/.test(name) ? "voice" : "music";
  if (node.tag === "video") return "video";
  if (attrs["data-composition-src"] || attrs["data-composition-id"]) return "scene";
  if (node.tag === "img" || node.tag === "svg" || node.tag === "picture") return "image";
  if (hasOwnText(html, node)) return "text";
  return "element";
}

const KIND_LABEL: Record<ClipKind, string> = {
  video: "Vidéo",
  scene: "Scène",
  image: "Image",
  text: "Texte",
  element: "Bloc",
  captions: "Sous-titres",
  voice: "Voix",
  music: "Musique",
};

/** The name given to an element: `data-label`, or `data-layer` in créations made before HyperFrames deprecated it. */
export function layerName(attrs: Record<string, string | undefined>): string | undefined {
  return attrs["data-label"] ?? attrs["data-layer"];
}

export function labelOf(html: string, node: HtmlNode, kind: ClipKind = kindOf(html, node)): string {
  const attrs = node.attrs;
  const named = layerName(attrs) ?? attrs["data-timeline-label"];
  if (named?.trim()) return named.trim();
  if (kind === "text") {
    const text = textOf(html, node);
    if (text) return text.length > 32 ? `${text.slice(0, 31)}…` : text;
  }
  if (attrs.id && attrs.id !== "root") return humanize(attrs.id);
  if (attrs.alt?.trim()) return attrs.alt.trim();
  if (attrs.src) return fileName(attrs.src);
  if (attrs["data-composition-src"]) return humanize(fileName(attrs["data-composition-src"]).replace(/\.html?$/, ""));
  const className = (attrs.class ?? "").split(/\s+/).filter((name) => name && name !== "clip").pop();
  if (className) return humanize(className);
  return KIND_LABEL[kind];
}

export function targetOf(node: HtmlNode): ElementTarget {
  return node.attrs["data-hf-id"] ? { hfId: node.attrs["data-hf-id"] } : { id: node.attrs.id };
}

export function keyOf(node: HtmlNode): string {
  return node.attrs["data-hf-id"] ?? node.attrs.id ?? `@${node.start}`;
}

/** The root composition: the first element carrying `data-composition-id`. */
export function rootOf(document: HtmlNode): HtmlNode | null {
  return findFirst(document, (node) => node.attrs["data-composition-id"] !== undefined);
}

/**
 * The clips of a composition file: every timed element (`data-start`) under the root, not nested in another clip
 * (a scene's inner timing belongs to its own file).
 */
export function parseComposition(html: string): Composition {
  const document = parseHtml(html);
  const root = rootOf(document);
  const width = number(root?.attrs["data-width"], 1920);
  const height = number(root?.attrs["data-height"], 1080);
  const timed: HtmlNode[] = [];
  if (root) {
    walk(root, (node) => {
      if (node.attrs["data-start"] === undefined) return;
      timed.push(node);
      return false;
    });
  }
  const authored = number(root?.attrs["data-duration"], Number.NaN);
  const ends = timed.map((node) => number(node.attrs["data-start"], 0) + number(node.attrs["data-duration"], 0));
  const duration = Number.isFinite(authored) && authored > 0 ? authored : Math.max(1, ...ends);

  const clips = timed.map((node): Clip => {
    const kind = kindOf(html, node);
    const start = number(node.attrs["data-start"], 0);
    const authoredDuration = number(node.attrs["data-duration"], Number.NaN);
    const open = !(Number.isFinite(authoredDuration) && authoredDuration > 0);
    const mediaStartAttr = node.attrs["data-playback-start"] !== undefined ? "data-playback-start" : "data-media-start";
    return {
      target: targetOf(node),
      key: keyOf(node),
      id: node.attrs.id ?? null,
      tag: node.tag,
      kind,
      lane: LANE_OF[kind],
      label: labelOf(html, node, kind),
      start,
      duration: open ? Math.max(0, duration - start) : authoredDuration,
      open,
      track: number(node.attrs["data-track-index"], 0),
      src: node.attrs.src ?? null,
      compositionSrc: node.attrs["data-composition-src"] ?? null,
      volume: node.tag === "audio" || node.tag === "video" ? number(node.attrs["data-volume"], 1) : null,
      mediaStart: number(node.attrs[mediaStartAttr], 0),
      mediaStartAttr,
      text: kind === "text" ? textOf(html, node) : "",
      variable: node.attrs["data-var-text"] ?? node.attrs["data-var-src"] ?? null,
    };
  });

  return {
    root: root ? targetOf(root) : null,
    rootKey: root ? keyOf(root) : null,
    width,
    height,
    duration,
    clips,
  };
}

/** The lanes that hold clips, each split into rows so overlapping clips (a transition) do not cover each other. */
export function layoutLanes(clips: Clip[]): Array<{ id: LaneId; label: string; rows: Clip[][] }> {
  return LANES.map((lane) => {
    const rows: Clip[][] = [];
    const ordered = clips.filter((clip) => clip.lane === lane.id).sort((a, b) => a.start - b.start || a.track - b.track);
    for (const clip of ordered) {
      const row = rows.find((candidate) => candidate[candidate.length - 1].start + candidate[candidate.length - 1].duration <= clip.start + 1e-3);
      if (row) row.push(clip);
      else rows.push([clip]);
    }
    return { id: lane.id, label: lane.label, rows };
  }).filter((lane) => lane.rows.length > 0);
}

/** One engine `patch-element` call. */
export type PatchOperation =
  | { type: "attribute"; property: string; value: string | null }
  | { type: "inline-style"; property: string; value: string | null }
  | { type: "text-content"; value: string }
  /** One piece of the element's text (`textRuns`), the others and their markup kept. */
  | { type: "text-run"; index: number; value: string }
  /** A text split word by word (one element per word, to animate them): the words go back one per piece. */
  | { type: "text-words"; value: string }
  | { type: "html-attribute"; property: string; value: string | null };
export type ElementPatch = { target: ElementTarget; operations: PatchOperation[] };

const attr = (property: string, value: number | string | null): PatchOperation => ({
  type: "attribute",
  property: property.replace(/^data-/, ""),
  value: value === null ? null : String(typeof value === "number" ? round(value) : value),
});

/** Keeps the composition as long as its clips, unless it was authored to run past them (a held last frame). */
function rootPatch(composition: Composition, clips: Clip[]): ElementPatch[] {
  if (!composition.root) return [];
  const end = (list: Clip[]) => Math.max(0, ...list.filter((clip) => !clip.open).map((clip) => clip.start + clip.duration));
  const before = end(composition.clips);
  const after = end(clips);
  const holds = composition.duration > before + 0.01;
  const duration = round(holds ? Math.max(composition.duration, after) : after);
  if (duration <= 0 || Math.abs(duration - composition.duration) < 1e-3) return [];
  return [{ target: composition.root, operations: [attr("data-duration", duration)] }];
}

function withClip(composition: Composition, clip: Clip, change: Partial<Clip>): Clip[] {
  return composition.clips.map((candidate) => (candidate.key === clip.key ? { ...candidate, ...change } : candidate));
}

/** Moves a clip to `start` (clamped at 0). */
export function moveClip(composition: Composition, clip: Clip, start: number): ElementPatch[] {
  const next = round(Math.max(0, start));
  if (Math.abs(next - clip.start) < 1e-3) return [];
  return [
    { target: clip.target, operations: [attr("data-start", next)] },
    ...rootPatch(composition, withClip(composition, clip, { start: next })),
  ];
}

export const MIN_CLIP = 0.1;

/**
 * Trims a clip from one edge to `time`. Trimming the start of a video or a sound also moves where its media
 * starts playing, so what stays on screen does not slide.
 */
export function trimClip(composition: Composition, clip: Clip, edge: "start" | "end", time: number): ElementPatch[] {
  const end = clip.start + clip.duration;
  if (edge === "end") {
    const duration = round(Math.max(MIN_CLIP, time - clip.start));
    if (Math.abs(duration - clip.duration) < 1e-3) return [];
    return [
      { target: clip.target, operations: [attr("data-duration", duration)] },
      ...rootPatch(composition, withClip(composition, clip, { duration, open: false })),
    ];
  }
  const earliest = clip.kind === "video" || clip.kind === "voice" || clip.kind === "music" ? clip.start - clip.mediaStart : 0;
  const start = round(Math.min(end - MIN_CLIP, Math.max(Math.max(0, earliest), time)));
  if (Math.abs(start - clip.start) < 1e-3) return [];
  const duration = round(end - start);
  const operations = [attr("data-start", start), attr("data-duration", duration)];
  if (clip.tag === "video" || clip.tag === "audio") operations.push(attr(clip.mediaStartAttr, round(clip.mediaStart + (start - clip.start))));
  return [
    { target: clip.target, operations },
    ...rootPatch(composition, withClip(composition, clip, { start, duration, open: false })),
  ];
}

/** Sets the length of the whole composition. */
export function setCompositionDuration(composition: Composition, duration: number): ElementPatch[] {
  if (!composition.root) return [];
  return [{ target: composition.root, operations: [attr("data-duration", round(Math.max(MIN_CLIP, duration)))] }];
}

export function setVolume(clip: Clip, volume: number): ElementPatch {
  return { target: clip.target, operations: [attr("data-volume", round(Math.min(1, Math.max(0, volume))))] };
}

/** Names an element with `data-label`, dropping the deprecated `data-layer` it may carry from an older création. */
export function labelOperations(label: string): PatchOperation[] {
  return [attr("data-label", label.trim() || null), attr("data-layer", null)];
}

export function setClipLabel(clip: Clip, label: string): ElementPatch {
  return { target: clip.target, operations: labelOperations(label) };
}

/** Points to the nearest snapping time within `threshold`, else `time` unchanged. */
export function snapTime(time: number, targets: number[], threshold: number): number {
  let best = time;
  let distance = threshold;
  for (const target of targets) {
    const gap = Math.abs(target - time);
    if (gap <= distance) {
      best = target;
      distance = gap;
    }
  }
  return best;
}

/** The edges a moving clip can snap to: the playhead, 0, the end, and the edges of the other clips. */
export function snapTargets(composition: Composition, playhead: number, except?: string): number[] {
  const edges = composition.clips.filter((clip) => clip.key !== except).flatMap((clip) => [clip.start, clip.start + clip.duration]);
  return [0, playhead, composition.duration, ...edges];
}

/** `m:ss.cc` for the timecode. */
export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, "0")}`;
}

/**
 * Moves the root timeline's tweens on one clip (`tl.to("#id", {…}, 3.2)`: its entrance, its exit, the transitions
 * written by the workflow) by `delta` seconds, so they follow the clip. Only one-line calls whose position is a
 * plain number are touched; anything else is left to the author.
 */
export function shiftClipTweens(html: string, id: string, delta: number): string {
  if (!id || Math.abs(delta) < 1e-6) return html;
  const selector = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const call = new RegExp(`^(\\s*[\\w$.\\[\\]"']+\\.(?:to|from|fromTo|set)\\(\\s*(["'\`])#${selector}\\2[^\\n]*,\\s*)(-?\\d*\\.?\\d+)(\\s*\\)\\s*;?\\s*)$`);
  return html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi, (whole, open: string, body: string, close: string) => {
    if (/\bsrc\s*=/.test(open)) return whole;
    const shifted = body
      .split("\n")
      .map((line) => line.replace(call, (_, head: string, _quote: string, position: string, tail: string) => `${head}${round(Math.max(0, Number(position) + delta))}${tail}`))
      .join("\n");
    return open + shifted + close;
  });
}
