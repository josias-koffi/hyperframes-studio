/**
 * A light HTML reader for the editor: the element tree of a composition with the source offsets of every tag, so
 * an edit rewrites only the bytes it touches. It runs the same in the browser and in Node (no DOM), and assumes
 * what Claude and the engine write: well-formed markup. A stray closing tag is ignored, an unclosed element ends
 * with its parent.
 */
export type HtmlNode = {
  tag: string;
  attrs: Record<string, string>;
  /** Offset of `<` of the opening tag. */
  start: number;
  /** Offset just after the opening tag's `>`. */
  openEnd: number;
  /** Offset of `</` of the closing tag (`openEnd` for a void or self-closed element). */
  closeStart: number;
  /** Offset just after the closing tag. */
  end: number;
  children: HtmlNode[];
  parent: HtmlNode | null;
};

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
const TAG = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(ATTR)) {
    const name = match[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/** The document as a tree; the returned node is a virtual root (`tag: "#document"`) spanning the whole source. */
export function parseHtml(html: string): HtmlNode {
  const document: HtmlNode = { tag: "#document", attrs: {}, start: 0, openEnd: 0, closeStart: html.length, end: html.length, children: [], parent: null };
  const stack: HtmlNode[] = [document];
  TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG.exec(html))) {
    const [whole, closing, opening, attrSource, selfClosing] = match;
    if (closing) {
      const tag = closing.toLowerCase();
      let at = stack.length - 1;
      while (at > 0 && stack[at].tag !== tag) at--;
      if (at <= 0) continue;
      for (let index = stack.length - 1; index > at; index--) {
        const unclosed = stack[index];
        unclosed.closeStart = unclosed.end = match.index;
      }
      const node = stack[at];
      node.closeStart = match.index;
      node.end = match.index + whole.length;
      stack.length = at;
      continue;
    }
    if (!opening) continue;
    const tag = opening.toLowerCase();
    const parent = stack[stack.length - 1];
    const openEnd = match.index + whole.length;
    const node: HtmlNode = { tag, attrs: parseAttributes(attrSource ?? ""), start: match.index, openEnd, closeStart: openEnd, end: openEnd, children: [], parent };
    parent.children.push(node);
    if (VOID.has(tag) || selfClosing) continue;
    if (RAW_TEXT.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, "ig");
      close.lastIndex = openEnd;
      const found = close.exec(html);
      node.closeStart = found ? found.index : html.length;
      node.end = found ? found.index + found[0].length : html.length;
      TAG.lastIndex = node.end;
      continue;
    }
    stack.push(node);
  }
  for (let index = stack.length - 1; index > 0; index--) stack[index].closeStart = stack[index].end = html.length;
  return document;
}

export function walk(node: HtmlNode, visit: (node: HtmlNode) => boolean | void): void {
  for (const child of node.children) {
    if (visit(child) === false) continue;
    walk(child, visit);
  }
}

export function findAll(node: HtmlNode, predicate: (node: HtmlNode) => boolean): HtmlNode[] {
  const found: HtmlNode[] = [];
  walk(node, (child) => {
    if (predicate(child)) found.push(child);
  });
  return found;
}

export function findFirst(node: HtmlNode, predicate: (node: HtmlNode) => boolean): HtmlNode | null {
  let found: HtmlNode | null = null;
  walk(node, (child) => {
    if (found) return false;
    if (predicate(child)) found = child;
  });
  return found;
}

export function byHfId(document: HtmlNode, hfId: string): HtmlNode | null {
  return findFirst(document, (node) => node.attrs["data-hf-id"] === hfId);
}

/** The text an element shows: its source without tags, entities decoded, whitespace collapsed. */
export function textOf(html: string, node: HtmlNode): string {
  if (node.closeStart <= node.openEnd) return "";
  const inner = html.slice(node.openEnd, node.closeStart).replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, "");
  return decodeEntities(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * A piece of text of the source: `[from, to)` raw, `text` as shown in the editor (entities decoded, whitespace
 * collapsed and trimmed), `content` as the page has it (whitespace collapsed, not trimmed).
 */
export type TextRun = { from: number; to: number; text: string; content: string };

/** The text between the direct children of `node` (its own text), pieces that are only whitespace left out. */
export function ownTextRuns(html: string, node: HtmlNode): TextRun[] {
  if (node.closeStart <= node.openEnd || node.tag === "script" || node.tag === "style") return [];
  const runs: TextRun[] = [];
  const push = (from: number, to: number) => {
    const raw = html.slice(from, to);
    const content = decodeEntities(raw).replace(/\s+/g, " ");
    if (raw.trim()) runs.push({ from, to, text: content.trim(), content });
  };
  let cursor = node.openEnd;
  for (const child of node.children) {
    push(cursor, child.start);
    cursor = child.end;
  }
  push(cursor, node.closeStart);
  return runs;
}

/** Every piece of text inside `node`, in reading order: a styled word (`<b>1/4</b> Brief`) is a piece of its own. */
export function textRuns(html: string, node: HtmlNode): TextRun[] {
  if (node.closeStart <= node.openEnd || node.tag === "script" || node.tag === "style") return [];
  const runs: TextRun[] = [];
  const own = ownTextRuns(html, node);
  let at = 0;
  for (const child of node.children) {
    while (at < own.length && own[at].to <= child.start) runs.push(own[at++]);
    runs.push(...textRuns(html, child));
  }
  runs.push(...own.slice(at));
  return runs;
}

/** Replaces a piece of text, keeping the whitespace around it. */
export function setTextRunEdit(html: string, run: TextRun, value: string): SourceEdit {
  const raw = html.slice(run.from, run.to);
  return { from: run.from, to: run.to, text: `${/^\s*/.exec(raw)![0]}${escapeHtml(value)}${/\s*$/.exec(raw)![0]}` };
}

/** Whether the element holds text of its own (not only through child elements). */
export function hasOwnText(html: string, node: HtmlNode): boolean {
  let cursor = node.openEnd;
  for (const child of node.children) {
    if (html.slice(cursor, child.start).trim()) return true;
    cursor = child.end;
  }
  return node.closeStart > cursor && html.slice(cursor, node.closeStart).trim() !== "";
}

export function outerHtml(html: string, node: HtmlNode): string {
  return html.slice(node.start, node.end);
}

/** One textual change of the source: `[from, to)` replaced by `text`. */
export type SourceEdit = { from: number; to: number; text: string };

/** Applies edits that do not overlap, whatever their order. */
export function applyEdits(html: string, edits: SourceEdit[]): string {
  let result = html;
  for (const edit of [...edits].sort((a, b) => b.from - a.from || b.to - a.to)) {
    result = result.slice(0, edit.from) + edit.text + result.slice(edit.to);
  }
  return result;
}

/**
 * Sets (or, with `null`, removes) attributes on the opening tag of `node`, keeping every other byte of the tag.
 */
export function setAttributesEdit(html: string, node: HtmlNode, values: Record<string, string | null>): SourceEdit {
  let tag = html.slice(node.start, node.openEnd);
  for (const [name, value] of Object.entries(values)) {
    const pattern = new RegExp(`(\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+))?(?=[\\s/>])`, "i");
    const present = pattern.test(tag);
    if (value === null) {
      if (present) tag = tag.replace(pattern, "");
    } else if (present) {
      tag = tag.replace(pattern, `$1${name}="${escapeHtml(value)}"`);
    } else {
      tag = tag.replace(/\s*(\/?)>$/, ` ${name}="${escapeHtml(value)}"$1>`);
    }
  }
  return { from: node.start, to: node.openEnd, text: tag };
}

export function setAttributes(html: string, node: HtmlNode, values: Record<string, string | null>): string {
  return applyEdits(html, [setAttributesEdit(html, node, values)]);
}

/** Every `id` and `data-hf-id` in the source, to mint new ones that clash with none. */
export function usedIds(document: HtmlNode): Set<string> {
  const ids = new Set<string>();
  walk(document, (node) => {
    if (node.attrs.id) ids.add(node.attrs.id);
    if (node.attrs["data-hf-id"]) ids.add(node.attrs["data-hf-id"]);
  });
  return ids;
}

export function uniqueId(base: string, taken: Set<string>): string {
  let candidate = base;
  for (let suffix = 2; taken.has(candidate); suffix++) candidate = `${base}-${suffix}`;
  taken.add(candidate);
  return candidate;
}

/** A fresh `data-hf-id` (`hf-xxxx`), like the engine mints them. */
export function mintHfId(taken: Set<string>, random: () => number = Math.random): string {
  for (;;) {
    const candidate = `hf-${Math.floor(random() * 36 ** 4)
      .toString(36)
      .padStart(4, "0")}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}
