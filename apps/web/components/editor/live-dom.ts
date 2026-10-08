import type { LiveDiff, LiveOp } from "@studio/shared/browser";

/** What the editor touches of GSAP in the preview's window. */
type Tween = { startTime(value?: number): number; targets(): unknown[] };
type GsapTimeline = Tween & { getChildren(nested: boolean, tweens: boolean, timelines: boolean): Tween[] };
type PreviewWindow = Window & { __timelines?: Record<string, GsapTimeline | undefined> };

function find(document: Document, key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-hf-id="${CSS.escape(key)}"]`) ?? document.getElementById(key);
}

/** The element's timing moved by `delta`: its own timeline (a scene) and the tweens aimed at it follow. */
function followStart(window: PreviewWindow, element: HTMLElement, start: number, delta: number, scripts: boolean) {
  const timelines = Object.values(window.__timelines ?? {}).filter((timeline): timeline is GsapTimeline => Boolean(timeline));
  const own = element.getAttribute("data-composition-id");
  if (own) window.__timelines?.[own]?.startTime(start);
  // Only when the source's tweens were shifted too (moving a clip), so the preview shows what was written.
  if (!scripts) return;
  for (const timeline of timelines) {
    for (const tween of timeline.getChildren(false, true, false)) {
      if (tween.targets().includes(element)) tween.startTime(Math.max(0, tween.startTime() + delta));
    }
  }
}

function apply(window: PreviewWindow, document: Document, op: LiveOp, scripts: boolean): boolean {
  switch (op.type) {
    case "attributes": {
      const element = find(document, op.key);
      if (!element) return false;
      const was = Number.parseFloat(element.getAttribute("data-start") ?? "");
      for (const [name, value] of Object.entries(op.set)) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
      for (const [property, value] of Object.entries(op.style)) {
        if (value === null) element.style.removeProperty(property);
        else element.style.setProperty(property, value);
      }
      const start = op.set["data-start"];
      if (start !== undefined && start !== null && Number.isFinite(was)) followStart(window, element, Number(start), Number(start) - was, scripts);
      return true;
    }
    case "inner": {
      const element = find(document, op.key);
      if (!element) return false;
      element.innerHTML = op.html;
      return true;
    }
    case "texts": {
      const element = find(document, op.key);
      if (!element) return false;
      const nodes = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (nodes.length !== op.texts.length) return false;
      nodes.forEach((node, at) => {
        node.textContent = op.texts[at];
      });
      return true;
    }
    case "remove": {
      find(document, op.key)?.remove();
      return true;
    }
    case "insert": {
      // A scene comes from its own file, inlined by the engine: the source's empty host is not enough.
      if (op.html.includes("data-composition-src")) return false;
      const parent = find(document, op.parentKey);
      if (!parent) return false;
      const template = document.createElement("template");
      template.innerHTML = op.html;
      const node = template.content.firstElementChild;
      if (!node) return false;
      const previous = op.afterKey ? find(document, op.afterKey) : null;
      if (previous && previous.parentElement === parent) previous.after(node);
      else parent.insertBefore(node, parent.firstChild);
      return true;
    }
    case "css": {
      // The new rules come after the page's own, so they win; rules that went away only matched removed elements.
      let style = document.querySelector<HTMLStyleElement>(`style[data-editor-css="${op.index}"]`);
      if (!style) {
        style = document.createElement("style");
        style.dataset.editorCss = String(op.index);
        document.head.append(style);
      }
      style.textContent = op.css;
      return true;
    }
  }
}

/**
 * Replays a change of the source in the preview's page. The HyperFrames runtime watches the timing attributes and
 * the elements coming and going, so the composition keeps playing right; `false` when a change could not be
 * replayed and the page must reload.
 */
export function applyLiveDiff(frame: HTMLIFrameElement | null, diff: LiveDiff): boolean {
  const window = frame?.contentWindow as PreviewWindow | null | undefined;
  const document = frame?.contentDocument;
  if (!window || !document) return false;
  try {
    return diff.ops.every((op) => apply(window, document, op, diff.scripts));
  } catch {
    return false;
  }
}
