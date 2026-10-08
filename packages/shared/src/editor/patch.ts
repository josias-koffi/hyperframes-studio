import { applyEdits, byHfId, escapeHtml, findFirst, outerHtml, parseHtml, setAttributesEdit, setTextRunEdit, textRuns, usedIds, type HtmlNode, type SourceEdit } from "./html-tree";
import { cloneElement, duplicateIdRules, parseStyle } from "./stills";
import { round, type Clip, type ElementPatch, type ElementTarget } from "./timeline";

/**
 * The edits of the editor, computed in the browser on the source it holds: each returns the new source and is sent
 * whole to the engine in one write. They change only the bytes they touch, like the engine's own mutations.
 */

export function findTarget(document: HtmlNode, target: ElementTarget): HtmlNode | null {
  if (target.hfId) {
    const node = byHfId(document, target.hfId);
    if (node) return node;
  }
  return target.id ? findFirst(document, (node) => node.attrs.id === target.id) : null;
}

export function styleText(style: Map<string, string>): string {
  return [...style].map(([property, value]) => `${property}: ${value}`).join("; ") + (style.size ? ";" : "");
}

function patchEdits(html: string, node: HtmlNode, patch: ElementPatch): SourceEdit[] {
  const attributes: Record<string, string | null> = {};
  let style: Map<string, string> | null = null;
  let text: string | null = null;
  const runEdits: SourceEdit[] = [];
  for (const operation of patch.operations) {
    if (operation.type === "attribute") attributes[`data-${operation.property}`] = operation.value;
    else if (operation.type === "html-attribute") attributes[operation.property] = operation.value;
    else if (operation.type === "inline-style") {
      style ??= parseStyle(node.attrs.style);
      if (operation.value === null || operation.value === "") style.delete(operation.property);
      else style.set(operation.property, operation.value);
    } else if (operation.type === "text-words") {
      const runs = textRuns(html, node);
      const words = operation.value.trim().split(/\s+/).filter(Boolean);
      // One word per piece, the extra ones in the last piece; pieces left without a word are emptied.
      runs.forEach((run, index) => runEdits.push(setTextRunEdit(html, run, index < runs.length - 1 ? (words[index] ?? "") : words.slice(index).join(" "))));
    } else if (operation.type === "text-run") {
      const run = textRuns(html, node)[operation.index];
      if (run) runEdits.push(setTextRunEdit(html, run, operation.value));
    } else text = operation.value;
  }
  if (style) attributes.style = style.size ? styleText(style) : null;
  const edits: SourceEdit[] = [];
  if (Object.keys(attributes).length) edits.push(setAttributesEdit(html, node, attributes));
  if (text !== null && node.end > node.openEnd) edits.push({ from: node.openEnd, to: node.closeStart, text: escapeHtml(text) });
  else edits.push(...runEdits);
  return edits;
}

/** Applies patches one after the other; a patch whose target is gone is skipped. */
export function applyPatches(html: string, patches: ElementPatch[]): string {
  let result = html;
  for (const patch of patches) {
    const node = findTarget(parseHtml(result), patch.target);
    if (node) result = applyEdits(result, patchEdits(result, node, patch));
  }
  return result;
}

/** Removes an element, with the indentation and line break before it. */
export function removeElementSource(html: string, target: ElementTarget): string {
  const node = findTarget(parseHtml(html), target);
  if (!node) return html;
  let from = node.start;
  while (from > 0 && /[ \t]/.test(html[from - 1])) from--;
  if (html[from - 1] === "\n") from--;
  return applyEdits(html, [{ from, to: node.end, text: "" }]);
}

/**
 * Cuts a clip at `time`: it ends there, and a copy (new ids, the same CSS rules) takes over until its old end,
 * its media starting where the first part stopped.
 */
export function splitClipSource(html: string, clip: Clip, time: number): { html: string; key: string | null } {
  const document = parseHtml(html);
  const node = findTarget(document, clip.target);
  const end = clip.start + clip.duration;
  if (!node || time <= clip.start || time >= end) return { html, key: null };
  const first = round(time - clip.start);
  const second = round(end - time);
  const { markup, renamed, rootHfId } = cloneElement(html, node, usedIds(document));
  const clone = parseHtml(markup).children[0];
  const values: Record<string, string | null> = { "data-start": String(round(time)), "data-duration": String(second) };
  if (clip.tag === "video" || clip.tag === "audio" || node.attrs[clip.mediaStartAttr] !== undefined) {
    values[clip.mediaStartAttr] = String(round(clip.mediaStart + first));
  }
  const copy = applyEdits(markup, [setAttributesEdit(markup, clone, values)]);
  let indent = node.start;
  while (indent > 0 && /[ \t]/.test(html[indent - 1])) indent--;
  return {
    html: applyEdits(html, [
      setAttributesEdit(html, node, { "data-duration": String(first) }),
      { from: node.end, to: node.end, text: `\n${html.slice(indent, node.start)}${copy}` },
      ...duplicateIdRules(html, document, renamed),
    ]),
    key: rootHfId ?? clone.attrs.id ?? null,
  };
}

/** The source of one element (to insert it live in the preview). */
export function elementSource(html: string, target: ElementTarget): string | null {
  const node = findTarget(parseHtml(html), target);
  return node ? outerHtml(html, node) : null;
}
