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
  sceneMidpoints,
  storyboardJsonSchema,
  studioAudio,
  type BlockManifest,
  type LoadedBlock,
  type Storyboard,
} from "./storyboard";

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

  it("catalogues the custom scene and the overlays apart from the scene blocks", () => {
    const catalog = blocksCatalog(all, format);
    expect(catalog.indexOf("### custom")).toBeLessThan(catalog.indexOf("## Calques par-dessus"));
    expect(catalog).toContain("### captions — Sous-titres");
    expect(catalog).toContain("Demande une voix off");
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
