import { ownTextRuns, parseHtml, walk, type HtmlNode } from "./html-tree";
import { parseStyle } from "./stills";

/**
 * What changed between two versions of a source file, as operations on the live preview: the preview's DOM holds
 * the same elements (same `data-hf-id`/`id`), so an edit is replayed there instead of reloading the page. `null`
 * when the change cannot be replayed (markup without ids changed): the preview has to reload.
 */
export type LiveOp =
  | { type: "attributes"; key: string; set: Record<string, string | null>; style: Record<string, string | null> }
  | { type: "inner"; key: string; html: string }
  /** The element's own pieces of text (between its children), in order; its children stay. */
  | { type: "texts"; key: string; texts: string[] }
  | { type: "remove"; key: string }
  | { type: "insert"; html: string; parentKey: string; afterKey: string | null }
  | { type: "css"; index: number; css: string };

export type LiveDiff = {
  ops: LiveOp[];
  /** A script changed (the tweens of a moved clip): the preview's timelines must follow the moved elements. */
  scripts: boolean;
};

const keyOfNode = (node: HtmlNode) => node.attrs["data-hf-id"] ?? node.attrs.id ?? null;
const RAW = new Set(["script", "style"]);

type Indexed = {
  html: string;
  document: HtmlNode;
  keyed: Map<string, HtmlNode>;
  styles: HtmlNode[];
  scripts: string[];
};

function index(html: string): Indexed {
  const document = parseHtml(html);
  const keyed = new Map<string, HtmlNode>();
  const styles: HtmlNode[] = [];
  const scripts: string[] = [];
  walk(document, (node) => {
    if (node.tag === "style") styles.push(node);
    if (node.tag === "script") scripts.push(html.slice(node.start, node.end));
    if (RAW.has(node.tag)) return false;
    const key = keyOfNode(node);
    if (key && !keyed.has(key)) keyed.set(key, node);
  });
  return { html, document, keyed, styles, scripts };
}

/**
 * The markup of `node`'s content with every keyed descendant (and every script and style) folded to a mark, the
 * ones in `only` (added or removed) dropped, and whitespace collapsed.
 */
function skeleton(source: Indexed, node: HtmlNode, only: Set<string>): string {
  let result = "";
  let cursor = node === source.document ? 0 : node.openEnd;
  const end = node === source.document ? source.html.length : node.closeStart;
  const fold = (child: HtmlNode) => {
    const key = keyOfNode(child);
    if (RAW.has(child.tag) || (key && source.keyed.get(key) === child)) {
      const mark = RAW.has(child.tag) ? `<#${child.tag}>` : only.has(key!) ? "" : `<#${key}>`;
      result += source.html.slice(cursor, child.start) + mark;
      cursor = child.end;
      return;
    }
    child.children.forEach(fold);
  };
  node.children.forEach(fold);
  return (result + source.html.slice(cursor, end)).replace(/\s+/g, " ").trim();
}

/** The direct children of `node`, folded like `skeleton`: what stays when only its own text changed. */
function childShape(source: Indexed, node: HtmlNode, only: Set<string>): string {
  return node.children
    .map((child) => {
      const key = keyOfNode(child);
      if (RAW.has(child.tag)) return `<#${child.tag}>`;
      if (key && source.keyed.get(key) === child) return only.has(key) ? "" : `<#${key}>`;
      return `<${child.tag}>${skeleton(source, child, only)}</${child.tag}>`;
    })
    .join("");
}

function hasKeyedDescendant(source: Indexed, node: HtmlNode): boolean {
  let found = false;
  walk(node, (child) => {
    if (found || RAW.has(child.tag)) return false;
    const key = keyOfNode(child);
    if (key && source.keyed.get(key) === child) found = true;
  });
  return found;
}

/** The closest keyed ancestor of a node (its key), or null. */
function keyedParent(source: Indexed, node: HtmlNode): string | null {
  for (let parent = node.parent; parent && parent !== source.document; parent = parent.parent) {
    const key = keyOfNode(parent);
    if (key && source.keyed.get(key) === parent) return key;
  }
  return null;
}

function attributeChanges(before: HtmlNode, after: HtmlNode) {
  const set: Record<string, string | null> = {};
  for (const [name, value] of Object.entries(after.attrs)) if (name !== "style" && before.attrs[name] !== value) set[name] = value;
  for (const name of Object.keys(before.attrs)) if (name !== "style" && !(name in after.attrs)) set[name] = null;
  const style: Record<string, string | null> = {};
  const was = parseStyle(before.attrs.style);
  const now = parseStyle(after.attrs.style);
  for (const [property, value] of now) if (was.get(property) !== value) style[property] = value;
  for (const property of was.keys()) if (!now.has(property)) style[property] = null;
  return { set, style };
}

export function liveDiff(beforeHtml: string, afterHtml: string): LiveDiff | null {
  if (beforeHtml === afterHtml) return { ops: [], scripts: false };
  const before = index(beforeHtml);
  const after = index(afterHtml);
  const onlyBefore = new Set([...before.keyed.keys()].filter((key) => !after.keyed.has(key)));
  const onlyAfter = new Set([...after.keyed.keys()].filter((key) => !before.keyed.has(key)));
  // Markup outside the keyed elements must be the same.
  if (skeleton(before, before.document, onlyBefore) !== skeleton(after, after.document, onlyAfter)) return null;
  if (before.styles.length !== after.styles.length) return null;

  const ops: LiveOp[] = [];
  const removed = new Set<string>();
  for (const [key, node] of before.keyed) {
    if (after.keyed.has(key)) continue;
    removed.add(key);
    const parent = keyedParent(before, node);
    if (parent && removed.has(parent)) continue;
    ops.push({ type: "remove", key });
  }
  const inserted = new Set<string>();
  for (const [key, node] of after.keyed) {
    const was = before.keyed.get(key);
    if (!was) {
      inserted.add(key);
      const parentKey = keyedParent(after, node);
      if (parentKey && inserted.has(parentKey)) continue;
      if (!parentKey || !node.parent || keyOfNode(node.parent) !== parentKey) return null;
      const siblings = node.parent.children;
      const previous = siblings
        .slice(0, siblings.indexOf(node))
        .reverse()
        .find((sibling) => keyOfNode(sibling) && before.keyed.has(keyOfNode(sibling)!));
      ops.push({ type: "insert", html: afterHtml.slice(node.start, node.end), parentKey, afterKey: previous ? keyOfNode(previous) : null });
      continue;
    }
    if (was.tag !== node.tag) return null;
    const { set, style } = attributeChanges(was, node);
    if (Object.keys(set).length || Object.keys(style).length) ops.push({ type: "attributes", key, set, style });
    if (skeleton(before, was, onlyBefore) !== skeleton(after, node, onlyAfter)) {
      const ownBefore = ownTextRuns(beforeHtml, was);
      const ownAfter = ownTextRuns(afterHtml, node);
      if (ownBefore.length === ownAfter.length && childShape(before, was, onlyBefore) === childShape(after, node, onlyAfter)) {
        ops.push({ type: "texts", key, texts: ownAfter.map((run) => run.content) });
      } else if (hasKeyedDescendant(after, node)) {
        // Rewriting the content would replace elements the animations hold.
        return null;
      } else {
        ops.push({ type: "inner", key, html: afterHtml.slice(node.openEnd, node.closeStart) });
      }
    }
  }
  before.styles.forEach((node, at) => {
    const css = beforeHtml.slice(node.openEnd, node.closeStart);
    const next = afterHtml.slice(after.styles[at].openEnd, after.styles[at].closeStart);
    if (css !== next) ops.push({ type: "css", index: at, css: next });
  });
  const scripts = before.scripts.length !== after.scripts.length || before.scripts.some((script, at) => script !== after.scripts[at]);
  return { ops, scripts };
}
