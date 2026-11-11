import { describe, expect, it } from "vitest";
import { assembleVideo, fillBlock, parseStoryboard } from "./storyboard";
import { templateSceneToBlock } from "./template-block";
import type { CompositionVariable } from "./variables";

const variables: CompositionVariable[] = [
  { id: "headline", label: "Titre", type: "string", default: "Soldes d'hiver", maxLength: 30 },
  { id: "photo", label: "Photo du produit", type: "string", default: "assets/uploads/tasse.png" },
  { id: "accent", label: "Couleur d'accent", type: "color", default: "#E11D48" },
  { id: "discount", label: "Remise", type: "number", default: 30 },
  { id: "unused", label: "Pas dans la scène", type: "string", default: "x" },
];

/** A template's root composition, the way the build writes it: the contract on <html>, bindings in the body. */
const indexHtml = `<!doctype html>
<html lang="fr" data-composition-variables='[]'>
  <head>
    <meta charset="UTF-8" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      #root { position: relative; width: 1080px; height: 1920px; background: #111; }
      #title { color: var(--accent, #fff); font-size: 120px; }
      #badge { border: 4px solid var(--accent); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="6" data-width="1080" data-height="1920">
      <h1 id="title" class="clip" data-start="0" data-duration="6" data-var-text="headline" data-label="Titre">Soldes d'hiver</h1>
      <img id="hero" data-var-src="photo" src="assets/uploads/tasse.png" data-label="Photo" />
      <p id="badge" data-label="Remise"></p>
      <audio id="music" src="assets/audio/bgm.mp3" data-start="0" data-duration="6"></audio>
    </div>
    <script>
      const { discount } = window.__hyperframes.getVariables();
      document.getElementById("badge").textContent = "-" + discount + " %";
      const tl = gsap.timeline({ paused: true });
      tl.from("#title", { y: 80, opacity: 0, duration: 0.6 }, 0);
      tl.from("#hero", { scale: 0.9, duration: 0.8 }, 0.2);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`;

const meta = { id: "promo-soldes", name: "Promo soldes", family: "maison", description: "Le titre, la photo et la remise.", useWhen: "Pour une promotion." };

describe("templateSceneToBlock", () => {
  it("turns the variables a scene uses into props, the template's defaults into the example", () => {
    const result = templateSceneToBlock({ html: indexHtml, variables, duration: 6, ...meta });
    expect(result.errors).toEqual([]);
    const { manifest, html } = result.block!;
    expect(Object.keys(manifest.props)).toEqual(["headline", "photo", "accent", "discount"]);
    expect(manifest.props.photo.type).toBe("image");
    expect(manifest.props.accent.type).toBe("color");
    expect(manifest.example).toEqual({ headline: "Soldes d'hiver", photo: "assets/uploads/tasse.png", accent: "#E11D48", discount: "30" });
    expect(manifest.duration).toEqual({ min: 3.6, max: 9.6, default: 6 });
    expect(manifest.family).toBe("maison");
    expect(html).toContain('data-label="Titre">{{headline}}</h1>');
    expect(html).toContain('src="{{photo}}"');
    expect(html).toContain("color: {{accent}}");
    expect(html).not.toMatch(/data-var-|gsap\.min\.js|<audio/);
  });

  it("gives every id the block's prefix and registers the block's timeline, so a video can show it twice", () => {
    const { block } = templateSceneToBlock({ html: indexHtml, variables, duration: 6, ...meta });
    const filled = fillBlock(block!, { headline: "Hello", discount: "50" }, { id: "scene-s2", duration: 6, width: 1080, height: 1920 });
    expect(filled).toContain('id="scene-s2-title"');
    expect(filled).toContain('tl.from("#scene-s2-title"');
    expect(filled).toContain('getElementById("scene-s2-badge")');
    expect(filled).toContain("#scene-s2-title { color: #E11D48");
    expect(filled).toContain('window.__timelines["scene-s2"] = tl');
    expect(filled).toContain('data-tv-discount="50"');
    expect(filled).toContain('data-composition-id="scene-s2" data-width="1080" data-height="1920"');
  });

  it("assembles in a storyboard like a shipped block", () => {
    const { block } = templateSceneToBlock({ html: indexHtml, variables, duration: 6, ...meta });
    const manifests = [block!.manifest];
    const { storyboard, errors } = parseStoryboard(
      JSON.stringify({ version: 1, title: "T", audio: { voice: false, music: null }, scenes: [{ id: "s1", title: "Promo", block: "promo-soldes", duration: 6, props: { headline: "Soldes" }, voiceover: "" }], overlays: [] }),
      manifests,
      { width: 1080, height: 1920 },
    );
    expect(errors).toEqual([]);
    const out = assembleVideo({ storyboard: storyboard!, blocks: new Map([[block!.manifest.id, block!]]), width: 1080, height: 1920 });
    expect(out.files["compositions/scenes/s1.html"]).toContain(">Soldes</h1>");
  });

  it("reads a sub-composition, and refuses a scene without its timeline", () => {
    const sub = `<template><div id="card" data-composition-id="card" data-width="1080" data-height="1920"><p id="t" data-var-text="headline">x</p></div>
<script>const tl = gsap.timeline({ paused: true }); window.__timelines["card"] = tl;</script></template>`;
    expect(templateSceneToBlock({ html: sub, variables, duration: 3, ...meta }).errors).toEqual([]);
    const broken = templateSceneToBlock({ html: sub.replace('window.__timelines["card"] = tl;', ""), variables, duration: 3, ...meta });
    expect(broken.errors.join()).toMatch(/n'enregistre pas sa timeline/);
  });
});
