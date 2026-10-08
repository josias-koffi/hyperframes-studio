"use client";

import {
  addSlide,
  applyPatches,
  duplicateSlide,
  insertElement,
  moveSlide,
  parseComposition,
  removeElementSource,
  removeSlide,
  slidesOf,
  type ElementTarget,
  type NewElement,
  type PatchOperation,
  type Placement,
} from "@studio/shared/browser";
import { useCallback, useMemo } from "react";
import { clientApi } from "@/lib/api";
import { useEditor } from "../editor-context";
import { textOperation, type TextPiece } from "../fields";

export const INDEX = "index.html";

/** A live change of the preview's DOM, applied before the source is patched so the canvas never waits. */
export type LiveStyle = Record<string, string | null>;

function liveElement(document: Document | null, target: ElementTarget): HTMLElement | null {
  if (!document) return null;
  const selector = target.hfId ? `[data-hf-id="${CSS.escape(target.hfId)}"]` : target.id ? `#${CSS.escape(target.id)}` : null;
  return selector ? document.querySelector<HTMLElement>(selector) : null;
}

/** An image's or a carousel's composition (index.html), its slides, and the edits the canvas makes to it. */
export function useCanvasActions() {
  const { creation, files, run, previewDocument } = useEditor();
  const source = files[INDEX]?.content ?? null;
  const composition = useMemo(() => (source ? parseComposition(source) : null), [source]);
  const slides = useMemo(() => (source && creation.type === "carousel" ? slidesOf(source) : []), [source, creation.type]);

  const element = useCallback((target: ElementTarget) => liveElement(previewDocument(), target), [previewDocument]);

  const patch = useCallback(
    (target: ElementTarget, operations: PatchOperation[], label: string, live = false) =>
      run(INDEX, (html) => applyPatches(html, [{ target, operations }]), { label, live }),
    [run],
  );

  /** Inline styles, shown at once in the preview and then written to the source. */
  const style = useCallback(
    (target: ElementTarget, values: LiveStyle, label: string) =>
      patch(
        target,
        Object.entries(values).map(([property, value]) => ({ type: "inline-style", property, value })),
        label,
      ),
    [patch],
  );

  /** The text of a layer, or one piece of it (see `TextPieces`). */
  const text = useCallback((target: ElementTarget, value: string, piece: TextPiece = null) => patch(target, [textOperation(value, piece)], "Modifier le texte"), [patch]);

  const attribute = useCallback(
    (target: ElementTarget, property: string, value: string | null, label: string) => patch(target, [{ type: "html-attribute", property, value }], label),
    [patch],
  );

  const rename = useCallback(
    (target: ElementTarget, label: string) => patch(target, [{ type: "attribute", property: "layer", value: label.trim() || null }], "Renommer le calque"),
    [patch],
  );

  const remove = useCallback((target: ElementTarget) => run(INDEX, (html) => removeElementSource(html, target), { label: "Supprimer le calque" }), [run]);

  /** Rewrites index.html from its current content (slides, added elements). */
  const rewrite = useCallback((label: string, change: (html: string) => string) => run(INDEX, change, { label }), [run]);

  /** Keeps the création's slide count (what the export captures) in step with the composition. */
  const syncSlideCount = useCallback(
    async (html: string) => {
      const count = slidesOf(html).length;
      if (count > 0) await clientApi(`/creations/${creation.id}/editor/slide-count`, { method: "PUT", body: JSON.stringify({ slideCount: count }) });
    },
    [creation.id],
  );

  const recount = (change: (html: string) => string) => (html: string) => {
    const next = change(html);
    if (next !== html) void syncSlideCount(next).catch(() => null);
    return next;
  };
  const slideOps = {
    add: (index: number) => rewrite("Ajouter une diapo", recount((html) => addSlide(html, index))),
    duplicate: (index: number) => rewrite("Dupliquer la diapo", recount((html) => duplicateSlide(html, index))),
    remove: (index: number) => rewrite("Supprimer la diapo", recount((html) => removeSlide(html, index))),
    move: (from: number, to: number) => rewrite("Déplacer la diapo", (html) => moveSlide(html, from, to)),
  };

  /** Adds an element to the current slide (or the image), returns its key once written. */
  const insert = useCallback(
    async (element: NewElement, placement: Placement, containerKey: string | null) => {
      let key = "";
      await rewrite(element.kind === "text" ? "Ajouter un texte" : element.kind === "image" ? "Ajouter une image" : "Ajouter une forme", (html) => {
        const result = insertElement(html, element, placement, containerKey);
        key = result.key;
        return result.html;
      });
      return key;
    },
    [rewrite],
  );

  return { composition, slides, element, style, text, attribute, rename, remove, insert, slideOps };
}

export type CanvasActions = ReturnType<typeof useCanvasActions>;
