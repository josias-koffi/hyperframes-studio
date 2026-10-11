import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addSlide,
  applyPatches,
  liveDiff,
  removeElementSource,
  splitClipSource,
  byHfId,
  duplicateSlide,
  insertElement,
  labelOperations,
  layersOf,
  layoutLanes,
  moveClip,
  moveSlide,
  nextTrack,
  parseComposition,
  parseHtml,
  removeSlide,
  setAttributes,
  shiftClipTweens,
  slidesOf,
  snapTime,
  textOf,
  trimClip,
} from "./index";

const fixture = (name: string) => readFileSync(join(__dirname, "..", "..", "test", "fixtures", name), "utf8");
const seeded = () => {
  let seed = 7;
  return () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
};

describe("html tree", () => {
  it("keeps source offsets, skips raw text and survives stray tags", () => {
    const html = '<div id="a"><p>Un <b>deux</b></p><script>if (a < b) "</div>";</script><img src="x.png"></span><br/></div>';
    const document = parseHtml(html);
    const div = document.children[0];
    expect(div.tag).toBe("div");
    expect(div.children.map((node) => node.tag)).toEqual(["p", "script", "img", "br"]);
    expect(html.slice(div.start, div.end)).toBe(html);
    expect(textOf(html, div.children[0])).toBe("Un deux");
  });

  it("rewrites only the opening tag it touches", () => {
    const html = '<section  class="slide"   data-start="1">x</section>';
    const node = parseHtml(html).children[0];
    expect(setAttributes(html, node, { "data-start": "2", "data-layer": "Titre & co", class: null })).toBe(
      '<section    data-start="2" data-layer="Titre &amp; co">x</section>',
    );
  });
});

describe("video timeline", () => {
  it("reads scenes, voices, music and captions into simplified lanes", () => {
    const composition = parseComposition(fixture("video-scenes.html"));
    expect(composition).toMatchObject({ width: 1080, height: 1920, duration: 18.521 });
    const lanes = layoutLanes(composition.clips);
    expect(lanes.map((lane) => lane.id)).toEqual(["scenes", "captions", "voice", "music"]);
    const scenes = lanes.find((lane) => lane.id === "scenes")!;
    // Scenes overlap during their transitions: two rows.
    expect(scenes.rows.length).toBe(2);
    expect(composition.clips.find((clip) => clip.id === "el-02-brief")).toMatchObject({ kind: "scene", label: "Brief", start: 3.657, track: 1 });
    expect(composition.clips.find((clip) => clip.id === "el-bgm")).toMatchObject({ kind: "music", volume: 0.18 });
  });

  it("reads footage as video with its overlays", () => {
    const composition = parseComposition(fixture("video-footage.html"));
    const rush = composition.clips.find((clip) => clip.kind === "video")!;
    expect(rush).toMatchObject({ id: "rush", lane: "video", start: 0 });
    expect(composition.clips.filter((clip) => clip.kind === "scene").length).toBe(4);
  });

  it("moves and trims clips, keeping the composition as long as its clips", () => {
    const composition = parseComposition(fixture("video-scenes.html"));
    const last = composition.clips.find((clip) => clip.id === "el-06-final")!;
    const moved = moveClip(composition, last, last.start + 1);
    expect(moved[0].operations).toEqual([{ type: "attribute", property: "start", value: "16.987" }]);
    // The music and the captions end at 18.521, the moved scene now at 19.521.
    expect(moved[1].operations).toEqual([{ type: "attribute", property: "duration", value: "19.521" }]);

    const music = composition.clips.find((clip) => clip.id === "el-bgm")!;
    expect(trimClip(composition, music, "start", 2)[0].operations).toEqual([
      { type: "attribute", property: "start", value: "2" },
      { type: "attribute", property: "duration", value: "16.521" },
      { type: "attribute", property: "media-start", value: "2" },
    ]);
    // Media cannot start before its file does.
    expect(trimClip(composition, music, "start", -3)).toEqual([]);
    expect(trimClip(composition, music, "end", 10)[0].operations).toEqual([{ type: "attribute", property: "duration", value: "10" }]);
  });

  it("moves the root timeline's tweens with their clip", () => {
    const html = fixture("video-scenes.html");
    const shifted = shiftClipTweens(html, "el-06-final", 2);
    expect(shifted).toContain('tl.fromTo("#el-06-final", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.inOut" }, 17.987);');
    // Other clips' tweens and the labels stay.
    expect(shifted).toContain('tl.to("#el-05-rendu", { opacity: 0, duration: 0.5, ease: "power2.inOut" }, 15.987);');
    expect(shifted).toContain('tl.addLabel("hf:transition:05-rendu:06-final:crossfade", 15.987);');
    expect(shiftClipTweens(html, "el-06-final", 0)).toBe(html);
  });

  it("names the template variable a clip is bound to", () => {
    const html = `<html><body><div data-composition-id="main" data-width="1920" data-height="1080" data-duration="5">
      <h1 id="title" class="clip" data-start="0" data-duration="5" data-var-text="headline">Fallback</h1>
      <h2 id="plain" class="clip" data-start="0" data-duration="5">Fixe</h2>
    </div></body></html>`;
    const clips = parseComposition(html).clips;
    expect(clips.find((clip) => clip.id === "title")).toMatchObject({ kind: "text", variable: "headline" });
    expect(clips.find((clip) => clip.id === "plain")).toMatchObject({ variable: null });
  });

  it("snaps to the nearest target in range", () => {
    expect(snapTime(4.02, [0, 4, 4.1], 0.05)).toBe(4);
    expect(snapTime(4.5, [0, 4], 0.05)).toBe(4.5);
  });
});

describe("carousel slides", () => {
  const carousel = fixture("carousel.html");
  const starts = (html: string) =>
    slidesOf(html).map((slide) => {
      const node = byHfId(parseHtml(html), slide.key)!;
      return `${node.attrs.id}@${node.attrs["data-start"]}`;
    });
  const rootDuration = (html: string) => parseComposition(html).duration;

  it("lists slides in time order with their capture time", () => {
    expect(slidesOf(carousel).map((slide) => [slide.label, slide.time])).toEqual([
      ["Diapo 1", 0.5],
      ["Diapo 2", 1.5],
      ["Diapo 3", 2.5],
    ]);
  });

  it("duplicates a slide with new ids and its CSS", () => {
    const html = duplicateSlide(carousel, 0);
    expect(starts(html)).toEqual(["s0@0", "s0-copie@1", "s1@2", "s2@3"]);
    expect(rootDuration(html)).toBe(4);
    expect(html).toContain("#s0-copie { background: #c0392b; }");
    const ids = [...html.matchAll(/data-hf-id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names the copy of a slide, not the first layer in it", () => {
    const html =
      '<div id="root" data-composition-id="m" data-duration="2"><section id="a" class="slide" data-start="0" data-duration="1"><div data-layer="Rectangle"></div></section>' +
      '<section id="b" class="slide" data-start="1" data-duration="1" data-layer="Fin"></section></div>';
    expect(duplicateSlide(html, 0)).toContain('<div data-layer="Rectangle"></div></section>');
    expect(duplicateSlide(html, 0)).not.toContain("Rectangle (copie)");
    // A slide named before `data-layer` was deprecated: its copy is named with `data-label`.
    expect(duplicateSlide(html, 1)).toContain('data-label="Fin (copie)"');
    expect(duplicateSlide(html, 1)).not.toContain('data-layer="Fin (copie)"');
    expect(slidesOf(html)[1].label).toBe("Fin");
  });

  it("moves, removes and adds slides", () => {
    expect(starts(moveSlide(carousel, 2, 0))).toEqual(["s2@0", "s0@1", "s1@2"]);
    const removed = removeSlide(carousel, 1);
    expect(starts(removed)).toEqual(["s0@0", "s2@1"]);
    expect(rootDuration(removed)).toBe(2);
    expect(removed).not.toContain('id="s1"');
    const added = addSlide(carousel, 0, seeded());
    expect(starts(added)).toEqual(["s0@0", "diapo-2@1", "s1@2", "s2@3"]);
    expect(rootDuration(added)).toBe(4);
    expect(removeSlide(removeSlide(removed, 0), 0)).toBe(removeSlide(removed, 0));
  });
});

describe("layers and added elements", () => {
  it("lists the visible elements of an image", () => {
    const layers = layersOf(fixture("image.html"));
    expect(layers).toEqual([expect.objectContaining({ tag: "h1", kind: "text", text: "Offre Pro −30 %" })]);
  });

  it("marks texts bound to a template variable", () => {
    const html = '<div id="root" data-composition-id="main"><h1 id="title" class="title" data-var-text="promo_title"></h1><div class="shape"></div></div>';
    expect(layersOf(html).map((layer) => [layer.kind, layer.label, layer.variable])).toEqual([
      ["text", "Title", "promo_title"],
      ["shape", "Shape", null],
    ]);
  });

  it("reads layer names from data-label, and from data-layer in older créations", () => {
    const html = '<div id="root" data-composition-id="main"><h1 data-label="Titre">A</h1><p data-layer="Ancien nom">B</p></div>';
    expect(layersOf(html).map((layer) => layer.label)).toEqual(["Titre", "Ancien nom"]);
  });

  it("renames a layer with data-label and drops data-layer", () => {
    const html = '<div id="root" data-composition-id="main"><p id="old" data-layer="Ancien nom">B</p></div>';
    const layer = layersOf(html)[0];
    const renamed = applyPatches(html, [{ target: layer.target, operations: labelOperations("Nouveau") }]);
    expect(renamed).toContain('data-label="Nouveau"');
    expect(renamed).not.toContain("data-layer");
  });

  it("adds a named, placed element to a slide or a timed one to a video", () => {
    const carousel = fixture("carousel.html");
    const slide = slidesOf(carousel)[1];
    const { html, key } = insertElement(carousel, { kind: "text", text: "Nouveau <titre>" }, { x: 80, y: 120 }, slide.key, seeded());
    const layers = layersOf(html, slide.key);
    expect(layers.find((layer) => layer.key === key)).toMatchObject({ kind: "text", label: "Texte", text: "Nouveau <titre>" });
    expect(html).toContain("left: 80px; top: 120px");
    expect(html).toContain('data-label="Texte"');
    expect(html).not.toContain("data-layer");

    const video = fixture("video-scenes.html");
    const track = nextTrack(video);
    const inserted = insertElement(video, { kind: "text", text: "Promo" }, { x: 0, y: 0, start: 2, duration: 3, track });
    expect(parseComposition(inserted.html).clips.find((clip) => clip.key === inserted.key)).toMatchObject({ kind: "text", start: 2, duration: 3, track, lane: "overlays" });
  });
});

describe("edits computed in the browser", () => {
  it("patches attributes, inline style and text in place", () => {
    const html = '<div id="root" data-composition-id="m"><p data-hf-id="hf-a" style="color: red; top: 2px">Un</p><i id="b">x</i></div>';
    const next = applyPatches(html, [
      { target: { hfId: "hf-a" }, operations: [{ type: "inline-style", property: "color", value: "blue" }, { type: "inline-style", property: "top", value: null }, { type: "text-content", value: "<Deux>" }] },
      { target: { id: "b" }, operations: [{ type: "attribute", property: "start", value: "2" }, { type: "html-attribute", property: "title", value: "t" }] },
      { target: { id: "absent" }, operations: [{ type: "attribute", property: "start", value: "1" }] },
    ]);
    expect(next).toBe('<div id="root" data-composition-id="m"><p data-hf-id="hf-a" style="color: blue;">&lt;Deux&gt;</p><i id="b" data-start="2" title="t">x</i></div>');
  });

  it("removes an element with its line", () => {
    const html = "<div>\n  <p id=\"a\">A</p>\n  <p id=\"b\">B</p>\n</div>";
    expect(removeElementSource(html, { id: "a" })).toBe("<div>\n  <p id=\"b\">B</p>\n</div>");
  });

  it("splits a clip into two that play on from where it stopped", () => {
    const html = fixture("video-scenes.html");
    const composition = parseComposition(html);
    const music = composition.clips.find((clip) => clip.id === "el-bgm")!;
    const { html: next, key } = splitClipSource(html, music, 10);
    expect(key).toMatch(/^hf-/);
    const after = parseComposition(next).clips.filter((clip) => clip.src === music.src);
    expect(after.map((clip) => [clip.start, clip.duration, clip.mediaStart])).toEqual([
      [0, 10, 0],
      [10, 8.521, 10],
    ]);
    expect(splitClipSource(html, music, 0).key).toBeNull();
  });
});

describe("live preview changes", () => {
  const html = fixture("video-scenes.html");
  const composition = parseComposition(html);
  const last = composition.clips.find((clip) => clip.id === "el-06-final")!;

  it("turns a moved clip into attribute changes and a script change", () => {
    const moved = shiftClipTweens(applyPatches(html, moveClip(composition, last, last.start + 1)), "el-06-final", 1);
    const diff = liveDiff(html, moved)!;
    expect(diff.scripts).toBe(true);
    expect(diff.ops).toContainEqual({ type: "attributes", key: last.key, set: { "data-start": "16.987" }, style: {} });
    // Undo is the same diff the other way.
    expect(liveDiff(moved, html)!.ops).toContainEqual({ type: "attributes", key: last.key, set: { "data-start": "15.987" }, style: {} });
  });

  it("replays removals, insertions, style and text", () => {
    const removed = removeElementSource(html, last.target);
    expect(liveDiff(html, removed)!.ops).toEqual([{ type: "remove", key: last.key }]);
    const back = liveDiff(removed, html)!.ops;
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ type: "insert", parentKey: composition.rootKey });

    const added = insertElement(html, { kind: "text", text: "Salut" }, { x: 0, y: 0, start: 1, duration: 2, track: 9 }, null, seeded()).html;
    expect(liveDiff(html, added)!.ops).toMatchObject([{ type: "insert", parentKey: composition.rootKey }]);

    const image = fixture("image.html");
    const title = layersOf(image).find((layer) => layer.kind === "text")!;
    const styled = applyPatches(image, [{ target: title.target, operations: [{ type: "inline-style", property: "color", value: "#f00" }, { type: "text-content", value: "Neuf" }] }]);
    expect(liveDiff(image, styled)!.ops).toEqual([
      { type: "attributes", key: title.key, set: {}, style: { color: "#f00" } },
      { type: "texts", key: title.key, texts: ["Neuf"] },
    ]);
  });

  it("edits one styled piece of a text and replays it live, its markup kept", () => {
    const html = '<div id="root" data-composition-id="m"><div data-hf-id="hf-s" id="step"><b data-hf-id="hf-b">1/4</b> Brief </div></div>';
    const layer = layersOf(html).find((candidate) => candidate.key === "hf-s")!;
    expect(layer.runs).toEqual(["1/4", "Brief"]);
    const next = applyPatches(html, [{ target: layer.target, operations: [{ type: "text-run", index: 1, value: "Le brief" }] }]);
    expect(next).toBe('<div id="root" data-composition-id="m"><div data-hf-id="hf-s" id="step"><b data-hf-id="hf-b">1/4</b> Le brief </div></div>');
    expect(liveDiff(html, next)!.ops).toEqual([{ type: "texts", key: "hf-s", texts: [" Le brief "] }]);
    const bold = applyPatches(html, [{ target: layer.target, operations: [{ type: "text-run", index: 0, value: "2/4" }] }]);
    expect(liveDiff(html, bold)!.ops).toEqual([{ type: "texts", key: "hf-b", texts: ["2/4"] }]);
  });

  it("puts the words of a sentence animated word by word back one per element", () => {
    const html = '<p id="s"><span>En</span> <span>une</span> <span>phrase</span></p>';
    const target = { id: "s" };
    expect(applyPatches(html, [{ target, operations: [{ type: "text-words", value: "En deux mots" }] }])).toBe(
      '<p id="s"><span>En</span> <span>deux</span> <span>mots</span></p>',
    );
    expect(applyPatches(html, [{ target, operations: [{ type: "text-words", value: "Plus de mots ici" }] }])).toBe(
      '<p id="s"><span>Plus</span> <span>de</span> <span>mots ici</span></p>',
    );
  });

  it("asks for a reload when markup without ids changes", () => {
    expect(liveDiff("<div><p>a</p></div>", "<div><p>b</p></div>")).toBeNull();
    // Markup without ids next to an element the animations may hold.
    expect(liveDiff('<div id="a"><b id="c">x</b><i>y</i></div>', '<div id="a"><b id="c">x</b><u>y</u></div>')).toBeNull();
  });
});
