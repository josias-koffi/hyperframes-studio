import { describe, expect, it } from "vitest";
import {
  assembleVideo,
  blockManifestSchema,
  blocksCatalog,
  fillBlock,
  isAssetPath,
  parseStoryboard,
  renderScriptMd,
  renderStoryboardMd,
  safeBottomPixels,
  scopeCss,
  assembleStills,
  sceneMidpoints,
  storyboardJsonSchema,
  studioAudio,
  type BlockManifest,
  type LoadedBlock,
  type Storyboard,
} from "./storyboard";
import { usesBlocks } from "./jobs";
import { layersOf, slidesOf } from "./editor";
import { applyVisualCorrections } from "./visual-review";

const hook: BlockManifest = blockManifestSchema.parse({
  id: "hook",
  name: "Accroche",
  description: "Une phrase.",
  useWhen: "Au début.",
  props: {
    text: { type: "text", label: "Phrase", maxLength: 20 },
    accent: { type: "color", label: "Accent", required: false, default: "#FF0000" },
  },
  duration: { min: 1, max: 5, default: 2 },
});

const media: BlockManifest = blockManifestSchema.parse({
  id: "media",
  name: "Image",
  description: "Une image.",
  useWhen: "Pour le produit.",
  props: {
    src: { type: "image", label: "Image" },
    motion: { type: "enum", label: "Mouvement", options: ["push-in", "none"], required: false, default: "push-in" },
  },
  duration: { min: 2, max: 8, default: 4 },
  aspects: ["9:16"],
});

const manifests = [hook, media];
const format = { width: 1080, height: 1920, durationSeconds: null };

const storyboard = (scenes: unknown[], audio: unknown = { voice: false, music: null }) => JSON.stringify({ version: 1, title: "Essai", audio, scenes });

const blocks = new Map<string, LoadedBlock>([
  ["hook", { manifest: hook, html: '<template><div id="root" data-composition-id="{{@id}}"><p style="color: {{accent}}">{{text}}</p></div><script>window.__timelines["{{@id}}"] = {{@duration}};</script></template>' }],
  ["media", { manifest: media, html: '<template><div id="root" data-composition-id="{{@id}}"><img src="{{src}}" data-motion="{{motion}}"></div></template>' }],
]);

describe("parseStoryboard", () => {
  it("accepts a valid storyboard, fenced or not", () => {
    const text = storyboard([{ id: "s1", title: "Hook", block: "hook", duration: 2, props: { text: "Bonjour" } }]);
    expect(parseStoryboard(text, manifests, format).storyboard?.scenes[0].transition).toBe("cut");
    expect(parseStoryboard("```json\n" + text + "\n```", manifests, format).errors).toEqual([]);
  });

  it("explains what to fix: unknown block, too long text, bad color, bad path, duration", () => {
    const { storyboard: parsed, errors } = parseStoryboard(
      storyboard([
        { id: "s1", title: "A", block: "nope", duration: 2, props: {} },
        { id: "s2", title: "B", block: "hook", duration: 9, props: { text: "x".repeat(25), accent: "red", extra: "?" } },
        { id: "s3", title: "C", block: "media", duration: 3, props: { src: "../secret.png", motion: "spin" } },
      ]),
      manifests,
      format,
    );
    expect(parsed).toBeNull();
    expect(errors.join("\n")).toMatch(/bloc inconnu « nope »/);
    expect(errors.join("\n")).toMatch(/25 caractères, 20 au plus/);
    expect(errors.join("\n")).toMatch(/couleur #RRGGBB/);
    expect(errors.join("\n")).toMatch(/prop « extra » inconnue/);
    expect(errors.join("\n")).toMatch(/hors des bornes/);
    expect(errors.join("\n")).toMatch(/commençant par assets\//);
    expect(errors.join("\n")).toMatch(/doit valoir push-in, none/);
  });

  it("refuses a block outside its frames, a voiceover without voice and a length far from the target", () => {
    const square = { width: 1080, height: 1080, durationSeconds: 30 };
    const { errors } = parseStoryboard(
      storyboard([{ id: "s1", title: "A", block: "media", duration: 3, props: { src: "assets/a.png" }, voiceover: "Bonjour" }], { voice: false, music: "lofi" }),
      manifests,
      square,
    );
    expect(errors.join("\n")).toMatch(/ne gère pas le cadre 1:1/);
    expect(errors.join("\n")).toMatch(/audio.voice vaut false : laisse tous les `voiceover` vides/);
    expect(errors.join("\n")).toMatch(/Durée totale 3\.0 s/);
  });

  it("reports invalid JSON and schema errors", () => {
    expect(parseStoryboard("not json", manifests, format).errors[0]).toMatch(/pas du JSON valide/);
    expect(parseStoryboard(JSON.stringify({ version: 2 }), manifests, format).errors.length).toBeGreaterThan(0);
  });
});

describe("rendering", () => {
  const parsed = parseStoryboard(
    storyboard(
      [
        { id: "s1", title: "Hook", block: "hook", duration: 2, props: { text: "Bonjour" }, voiceover: "Salut à toi." },
        { id: "s2", title: "Produit", block: "media", duration: 3, props: { src: "assets/uploads/p.png" }, voiceover: "" },
      ],
      { voice: true, music: "warm lofi" },
    ),
    manifests,
    format,
  ).storyboard as Storyboard;

  it("writes SCRIPT.md in the shape scripts/audio.mjs reads", () => {
    const script = renderScriptMd(parsed);
    expect(script).toContain("## Hook (Frame 1)\n\n    Salut à toi.");
    expect(script).toContain("## Produit (Frame 2)");
  });

  it("writes STORYBOARD.md with the frontmatter the runner reads", () => {
    expect(studioAudio(parsed)).toBe("voix+musique");
    const md = renderStoryboardMd(parsed, manifests, ["attention"]);
    expect(md).toMatch(/^---\ntitle: "Essai"\nengine: blocks\nstudio_audio: voix\+musique\n---/);
    expect(md).toContain("| 1 | Hook | Accroche | 2 s | text : Bonjour | Salut à toi. |");
    expect(md).toContain("- attention");
  });

  it("lists every block in the JSON schema", () => {
    const schema = storyboardJsonSchema(manifests) as { properties: { scenes: { items: { properties: { block: { enum: string[] } } } } } };
    expect(schema.properties.scenes.items.properties.block.enum).toEqual(["hook", "media", "custom"]);
  });
});

describe("fillBlock", () => {
  it("escapes values, uses defaults and the slot", () => {
    const html = fillBlock(blocks.get("hook")!, { text: '<b>"Hi"</b>' }, { id: "scene-s1", duration: 2.5, width: 1080, height: 1920 });
    expect(html).toContain("&lt;b&gt;&quot;Hi&quot;&lt;/b&gt;");
    expect(html).toContain("color: #FF0000");
    expect(html).toContain('window.__timelines["scene-s1"] = 2.5');
  });

  it("refuses an unknown placeholder", () => {
    const broken: LoadedBlock = { manifest: hook, html: "{{nope}}" };
    expect(() => fillBlock(broken, {}, { id: "x", duration: 1, width: 1, height: 1 })).toThrow(/placeholder inconnu/);
  });
});

describe("assembleVideo", () => {
  const parsed = parseStoryboard(
    storyboard(
      [
        { id: "s1", title: "Hook", block: "hook", duration: 2, props: { text: "Bonjour" }, voiceover: "Salut." },
        { id: "s2", title: "Produit", block: "media", duration: 3, props: { src: "assets/uploads/p.png" }, transition: "fade" },
        { id: "s3", title: "Fin", block: "hook", duration: 2, props: { text: "Fin" }, transition: "slide-up" },
      ],
      { voice: true, music: null },
    ),
    manifests,
    format,
  ).storyboard as Storyboard;

  it("stretches a scene to its voice, overlaps transitions and places audio", () => {
    const out = assembleVideo({
      storyboard: parsed,
      blocks,
      width: 1080,
      height: 1920,
      audio: { voices: [{ frame: 1, path: "assets/audio/voice/01.wav", duration_s: 2.8 }], bgm: { path: "assets/audio/music/bgm.mp3", volume: 0.2 } },
    });
    expect(out.timings).toEqual([
      { id: "s1", start: 0, duration: 3.2 },
      { id: "s2", start: 3.2, duration: 3 },
      { id: "s3", start: 6.2, duration: 2 },
    ]);
    expect(out.duration).toBe(8.2);
    expect(out.slots).toEqual({ s1: 3.7, s2: 3.5, s3: 2 });
    expect(sceneMidpoints(out.timings)).toEqual([1.6, 4.7, 7.2]);
    expect(Object.keys(out.files)).toEqual(["compositions/scenes/s1.html", "compositions/scenes/s2.html", "compositions/scenes/s3.html"]);
    expect(out.files["compositions/scenes/s1.html"]).toContain('window.__timelines["scene-s1"] = 3.7');
    expect(out.indexHtml).toContain('data-composition-id="scene-s1" data-composition-src="compositions/scenes/s1.html" data-start="0" data-duration="3.7"');
    expect(out.indexHtml).toContain('<audio id="el-s1-voice" src="assets/audio/voice/01.wav" data-start="0" data-duration="2.8"');
    expect(out.indexHtml).toContain('<audio id="el-bgm" src="assets/audio/music/bgm.mp3" data-start="0" data-duration="8.2" data-track-index="11" data-volume="0.2"');
    // A dip: the previous scene has faded out before the next one fades in.
    expect(out.indexHtml).toContain('tl.to("#el-s1", { opacity: 0, duration: 0.25, ease: "power2.in" }, 3.2);');
    expect(out.indexHtml).toContain('tl.fromTo("#el-s2", { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" }, 3.45);');
    expect(out.indexHtml).toContain('tl.to("#el-s2", { y: -1920, duration: 0.5, ease: "power3.inOut" }, 6.2);');
    expect(out.indexHtml).toContain('data-label="1. Hook"');
    expect(out.indexHtml).toContain('data-duration="8.2" data-width="1080"');
  });
});

describe("overlays and custom scenes", () => {
  const captions: BlockManifest = blockManifestSchema.parse({
    id: "captions",
    name: "Sous-titres",
    description: "Les mots dits.",
    useWhen: "Avec une voix off.",
    kind: "overlay",
    requires: ["voice"],
    props: { color: { type: "color", label: "Couleur", required: false, default: "#FFFFFF" } },
    duration: { min: 1, max: 60, default: 10 },
  });
  const all = [hook, media, captions];
  const withOverlays = new Map(blocks).set("captions", {
    manifest: captions,
    html: '<template><div id="root" data-composition-id="{{@id}}" style="color: {{color}}"></div><script>const words = {{@words}};</script></template>',
  });
  const scenes = [
    { id: "s1", title: "Hook", block: "hook", duration: 2, props: { text: "Bonjour" }, voiceover: "Salut toi." },
    { id: "s2", title: "Schéma", block: "custom", duration: 4, props: { description: "Un schéma des trois étapes." }, voiceover: "Voilà </script> comment." },
  ];
  const text = (overlays: unknown[], audio: unknown = { voice: true, music: null }) =>
    JSON.stringify({ version: 1, title: "Essai", audio, scenes, overlays });

  it("checks overlays: their kind, their scenes, what they need", () => {
    expect(parseStoryboard(text([{ id: "o1", block: "captions", from: "s1", to: "s2", props: {} }]), all, format).errors).toEqual([]);
    const errors = parseStoryboard(
      text(
        [
          { id: "o1", block: "hook", from: "s1", to: "s1", props: { text: "x" } },
          { id: "o2", block: "captions", from: "s2", to: "s1", props: {} },
          { id: "o3", block: "captions", from: "s1", to: "s9", props: {} },
        ],
        { voice: false, music: null },
      ),
      all,
      format,
    ).errors.join("\n");
    expect(errors).toMatch(/calque o1 : « hook » est un bloc de scène/);
    expect(errors).toMatch(/calque o2 : la scène from \(s2\) vient après la scène to \(s1\)/);
    expect(errors).toMatch(/calque o3 : from et to doivent être des ids de scène/);
    expect(errors).toMatch(/suit la voix off, qui est absente/);
  });

  it("refuses an overlay as a scene and a custom scene without description", () => {
    const bad = JSON.stringify({
      version: 1,
      title: "Essai",
      audio: { voice: false, music: null },
      scenes: [
        { id: "s1", title: "A", block: "captions", duration: 2, props: {} },
        { id: "s2", title: "B", block: "custom", duration: 2, props: { text: "x" } },
      ],
    });
    const errors = parseStoryboard(bad, all, format).errors.join("\n");
    expect(errors).toMatch(/scène s1 : « captions » est un calque/);
    expect(errors).toMatch(/scène s2 : une scène custom décrit ce qu'elle montre/);
    expect(errors).toMatch(/n'a que props.description \(en trop : text\)/);
  });

  it("lays overlays over their scenes with the spoken words, and points a custom scene at the agent's file", () => {
    const parsed = parseStoryboard(text([{ id: "o1", block: "captions", from: "s1", to: "s2", props: {} }]), all, format).storyboard as Storyboard;
    const out = assembleVideo({
      storyboard: parsed,
      blocks: withOverlays,
      width: 1080,
      height: 1920,
      audio: {
        voices: [
          { frame: 1, path: "assets/audio/voice/01.wav", duration_s: 1, words: [{ text: "Salut", start: 0.1, end: 0.5 }] },
          { frame: 2, path: "assets/audio/voice/02.wav", duration_s: 1, words: [{ text: "</script>", start: 0.2, end: 0.6 }] },
        ],
      },
    });
    expect(Object.keys(out.files)).toEqual(["compositions/scenes/s1.html", "compositions/overlays/o1.html"]);
    expect(out.indexHtml).toContain('data-composition-id="scene-s2" data-composition-src="compositions/custom/s2.html" data-start="2"');
    expect(out.indexHtml).toContain('<div id="el-o1" class="clip overlay" data-composition-id="overlay-o1" data-composition-src="compositions/overlays/o1.html" data-start="0" data-duration="6" data-track-index="20"');
    expect(out.files["compositions/overlays/o1.html"]).toContain(
      'const words = [{"text":"Salut","start":0.1,"end":0.5},{"text":"\\u003c/script>","start":2.2,"end":2.6}];',
    );
    const md = renderStoryboardMd(parsed, all);
    expect(md).toContain("| 2 | Schéma | Scène sur mesure | 4 s |");
    expect(md).toContain("| o1 | Sous-titres | s1 → s2 | — |");
  });

  it("keeps the bottom of the scenes under a bottom band free, and lays a limited overlay only where it may go", () => {
    const band = blockManifestSchema.parse({ ...captions, safeArea: "bottom" });
    const name = blockManifestSchema.parse({ ...captions, id: "name", kind: "overlay", requires: [], onlyOver: ["media"] });
    const withBand = new Map(withOverlays).set("captions", { manifest: band, html: '<template><div id="root" data-composition-id="{{@id}}" data-safe="{{@safeBottom}}"></div></template>' });
    const three = [...scenes, { id: "s3", title: "Fin", block: "hook", duration: 2, props: { text: "Fin" }, voiceover: "Merci." }];
    const parsed = parseStoryboard(
      JSON.stringify({ version: 1, title: "Essai", audio: { voice: true, music: null }, scenes: three, overlays: [{ id: "o1", block: "captions", from: "s2", to: "s3", props: {} }] }),
      [hook, media, band],
      format,
    ).storyboard as Storyboard;
    const out = assembleVideo({ storyboard: parsed, blocks: withBand, width: 1080, height: 1920 });
    expect(out.safeBottoms).toEqual({ s1: 0, s2: 576, s3: 576 });
    expect(out.files["compositions/overlays/o1.html"]).toContain('data-safe="0"');
    expect(safeBottomPixels(1920, 1080)).toBe(216);

    const errors = parseStoryboard(
      JSON.stringify({ version: 1, title: "Essai", audio: { voice: true, music: null }, scenes: three, overlays: [{ id: "o1", block: "name", from: "s1", to: "s1", props: {} }] }),
      [hook, media, name],
      format,
    ).errors.join("\n");
    expect(errors).toMatch(/calque o1 : name ne se pose que sur media \(s1 est un hook\)/);
    expect(blocksCatalog([hook, media, name], format)).toContain("Ne se pose que sur les scènes media.");
  });

  it("catalogues the custom scene and the overlays apart from the scene blocks", () => {
    const catalog = blocksCatalog(all, format);
    expect(catalog.indexOf("### custom")).toBeLessThan(catalog.indexOf("## Calques par-dessus"));
    expect(catalog).toContain("### captions — Sous-titres");
    expect(catalog).toContain("Demande une voix off");
  });
});

describe("templates", () => {
  const contract = [
    { id: "headline", type: "string" as const, label: "Accroche", default: "Offre de rentrée", maxLength: 30 },
    { id: "photo", type: "string" as const, label: "Photo", default: "assets/uploads/rentree.jpg" },
  ];
  const scenes = (variables: [Record<string, string>, Record<string, string>]) => [
    { id: "s1", title: "Hook", block: "hook", duration: 2, props: { text: "x" }, variables: variables[0] },
    { id: "s2", title: "Photo", block: "media", duration: 3, props: { src: "assets/uploads/autre.jpg" }, variables: variables[1] },
  ];
  const text = (variables: [Record<string, string>, Record<string, string>]) =>
    JSON.stringify({ version: 1, title: "Essai", audio: { voice: false, music: null }, scenes: scenes(variables) });

  it("shows every variable through a prop, which takes the variable's default", () => {
    const { storyboard: parsed, errors, warnings } = parseStoryboard(text([{ text: "headline" }, { src: "photo" }]), manifests, { ...format, variables: contract });
    expect(errors).toEqual([]);
    expect(parsed!.scenes[0].props.text).toBe("Offre de rentrée");
    expect(parsed!.scenes[1].props.src).toBe("assets/uploads/rentree.jpg");
    // The hook holds 20 characters, the variable 30.
    expect(warnings.join("\n")).toMatch(/accepte 30 caractères, le bloc hook en affiche 20/);

    const out = assembleVideo({ storyboard: parsed!, blocks, width: 1080, height: 1920, variables: contract });
    expect(out.files["compositions/scenes/s1.html"]).toContain('<p style="color: #FF0000" data-var-text="headline">Offre de rentrée</p>');
    expect(out.files["compositions/scenes/s2.html"]).toContain('<img src="assets/uploads/rentree.jpg" data-var-src="photo"');
    expect(out.indexHtml).toContain(`<html lang="fr" data-composition-variables='[{"id":"headline"`);
  });

  it("refuses a variable left out, unknown, on a prop that cannot carry it, or outside a template", () => {
    const errors = parseStoryboard(text([{ accent: "headline" }, { src: "nope" }]), manifests, { ...format, variables: contract }).errors.join("\n");
    expect(errors).toMatch(/la prop « accent » du bloc hook ne peut pas porter de variable/);
    expect(errors).toMatch(/variable « nope » inconnue/);
    expect(errors).toMatch(/La variable « photo » \(Photo\) n'est montrée par aucune scène/);
    expect(parseStoryboard(text([{ text: "headline" }, {}]), manifests, format).errors.join("\n")).toMatch(/ne sert qu'aux templates/);
  });
});

describe("stills", () => {
  const card: BlockManifest = blockManifestSchema.parse({
    id: "card",
    name: "Carte",
    description: "Un titre.",
    useWhen: "Partout.",
    props: { title: { type: "text", label: "Titre", maxLength: 30 }, accent: { type: "color", label: "Accent", required: false, default: "#FF0000" } },
    duration: { min: 2, max: 6, default: 4 },
  });
  const cards = new Map<string, LoadedBlock>([
    [
      "card",
      {
        manifest: card,
        html: `<!doctype html><html><body><template>
<style>
  #root { background: {{accent}}; }
  /* the title */
  .c-title, .c-sub { color: #fff; }
  @media (min-aspect-ratio: 1/1) { #root[data-x] .c-title { font-size: 10px; } }
</style>
<div id="root" data-composition-id="{{@id}}" data-width="{{@width}}" data-height="{{@height}}" data-x="1"><h2 id="{{@id}}-title" class="c-title" data-label="Titre">{{title}}</h2></div>
<script>
  (function () {
    // enter
    const tl = gsap.timeline({ paused: true });
    tl.to({}, { duration: {{@duration}} }, 0);
    window.__timelines["{{@id}}"] = tl;
  })();
</script>
</template></body></html>`,
      },
    ],
  ]);
  const slide = (id: string, title: string, accent?: string) => ({ id, title, block: "card", duration: 1, props: { title, ...(accent ? { accent } : {}) } });
  const carousel = { width: 1080, height: 1350, frames: 2 };

  it("asks for one scene per slide, without sound, overlays or custom scene, whatever the durations", () => {
    expect(parseStoryboard(storyboard([slide("s1", "Un"), slide("s2", "Deux")]), [card], carousel).errors).toEqual([]);
    const errors = parseStoryboard(
      JSON.stringify({
        version: 1,
        title: "C",
        audio: { voice: false, music: "lofi" },
        scenes: [slide("s1", "Un"), { id: "s2", title: "X", block: "custom", duration: 1, props: { description: "x" } }, slide("s3", "Trois")],
        overlays: [{ id: "o1", block: "card", from: "s1", to: "s1", props: {} }],
      }),
      [card],
      carousel,
    ).errors.join("\n");
    expect(errors).toMatch(/Ce carrousel a 2 slides : écris exactement 2 scènes/);
    expect(errors).toMatch(/n'a pas de son/);
    expect(errors).toMatch(/n'a pas de calque/);
    expect(errors).toMatch(/pas de scène custom dans une image ou un carrousel/);
    expect(blocksCatalog([card], carousel)).not.toContain("### custom");
  });

  it("scopes a block's CSS to its slide", () => {
    expect(scopeCss("#root { a: 1; }\n/* x */\n.t, .u { b: 2; }\n@media (x) { #root[data-x] .t { c: 3; } }", "scene-s1")).toBe(
      "#scene-s1 { a: 1; }\n#scene-s1 .t, #scene-s1 .u { b: 2; }\n@media (x) {\n#scene-s1[data-x] .t { c: 3; }\n}\n",
    );
  });

  it("lays every slide inline, settled, for the canvas editor", () => {
    const parsed = parseStoryboard(storyboard([slide("s1", "Un"), slide("s2", "Deux", "#0000FF")]), [card], carousel).storyboard as Storyboard;
    const out = assembleStills({ storyboard: parsed, blocks: cards, width: 1080, height: 1350 });
    expect(out.files).toEqual({});
    expect(out.duration).toBe(2);
    expect(sceneMidpoints(out.timings)).toEqual([0.5, 1.5]);
    expect(out.indexHtml).toContain('<section id="el-s2" class="clip slide" data-start="1" data-duration="1" data-track-index="1" data-label="2. Deux">');
    expect(out.indexHtml).toContain("#scene-s2 { background: #0000FF; }");
    expect(out.indexHtml).toContain('<div id="scene-s2" data-x="1"><h2 id="scene-s2-title"');
    // Set to 80 % of the block's default length, never registered: only the root's timeline is.
    expect(out.indexHtml).toContain('tl.to({}, { duration: 4 }, 0); tl.time(3.2); })();');
    expect(out.indexHtml).not.toContain("// enter");
    expect(out.indexHtml.match(/window\.__timelines\[/g)).toHaveLength(1);
    expect(slidesOf(out.indexHtml).map((slide) => slide.label)).toEqual(["1. Un", "2. Deux"]);
    expect(layersOf(out.indexHtml, slidesOf(out.indexHtml)[1].key).map((layer) => layer.label)).toEqual(["Titre"]);
  });
});

describe("usesBlocks", () => {
  it("covers a video from an idea, one-shot or template, not one made from footage", () => {
    expect(usesBlocks({ type: "video", kind: "template", brief: { engine: "blocks" } })).toBe(true);
    expect(usesBlocks({ type: "video", kind: "oneshot", brief: { engine: "blocks", footage: "a.mp4" } })).toBe(false);
    expect(usesBlocks({ type: "video", kind: "oneshot", brief: {} })).toBe(false);
    expect(usesBlocks({ type: "carousel", kind: "oneshot", brief: { engine: "blocks" } })).toBe(true);
  });
});

describe("isAssetPath", () => {
  it("keeps paths inside assets/", () => {
    expect(isAssetPath("assets/uploads/a.png")).toBe(true);
    expect(isAssetPath("assets/../index.html")).toBe(false);
    expect(isAssetPath("/etc/passwd")).toBe(false);
    expect(isAssetPath('assets/a".png')).toBe(false);
  });
});

describe("applyVisualCorrections", () => {
  const contract = { ...format, variables: [{ id: "headline", type: "string" as const, label: "Accroche", default: "Fin" }] };
  const parsed = parseStoryboard(
    storyboard([
      { id: "s1", title: "A", block: "hook", duration: 2, props: { text: "Bonjour à tous" }, variables: {} },
      { id: "s2", title: "B", block: "hook", duration: 2, props: { text: "Fin" }, variables: { text: "headline" } },
    ]),
    manifests,
    contract,
  ).storyboard!;
  const issue = (scene: string, props: Record<string, string> | null) => ({ scene, problem: "Texte coupé", severity: "high" as const, correction: props && { props } });

  it("applies a fix of existing props and keeps the rest open, with the reason", () => {
    const { storyboard: corrected, issues } = applyVisualCorrections(
      parsed,
      [
        issue("s1", { text: "Bonjour", accent: "#000000" }),
        issue("s1", { size: "12" }),
        issue("s2", { text: "Autre" }),
        issue("s1", { text: "x".repeat(30) }),
        issue("s2", null),
      ],
      manifests,
      contract,
    );
    expect(corrected?.scenes[0].props).toEqual({ text: "Bonjour", accent: "#000000" });
    expect(corrected?.scenes[1].props.text).toBe("Fin");
    expect(issues.map((item) => item.status)).toEqual(["applied", "open", "open", "open", "open"]);
    expect(issues[1].reason).toMatch(/props inconnues du bloc hook : size/);
    expect(issues[2].reason).toMatch(/liées à une variable du template : text/);
    expect(issues[3].reason).toMatch(/correction refusée/);
  });

  it("returns no storyboard when nothing changed", () => {
    expect(applyVisualCorrections(parsed, [issue("s1", null)], manifests, contract).storyboard).toBeNull();
  });
});
