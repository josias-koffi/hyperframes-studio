import { fillBlock, type BlockWord, type LoadedBlock } from "./storyboard";

const GSAP_SRC = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js";
const PREVIEW_ID = "preview";
/** The words a captions block shows in its preview, spread over the block's default length. */
const SAMPLE_SPEECH = "Voici les sous-titres, mot à mot, calés sur la voix off de la vidéo.";

/** A neutral picture for an image prop: the shipped examples point at files only a création has. */
function placeholderImage(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c7d2fe"/><stop offset="1" stop-color="#fbcfe8"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><circle cx="560" cy="250" r="90" fill="#ffffff" fill-opacity="0.7"/><path d="M0 640 L260 380 L460 560 L580 460 L800 660 L800 800 L0 800 Z" fill="#ffffff" fill-opacity="0.55"/><text x="400" y="430" font-family="system-ui, sans-serif" font-size="56" font-weight="700" fill="#4c4f6b" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function sampleWords(duration: number): BlockWord[] {
  const words = SAMPLE_SPEECH.split(" ");
  const step = (duration * 0.9) / words.length;
  return words.map((text, index) => ({ text, start: Math.round(index * step * 1000) / 1000, end: Math.round((index + 0.85) * step * 1000) / 1000 }));
}

/**
 * A page that plays one block on a loop, filled with its `example` (an image prop gets a neutral picture, a captions
 * block sample words), for the « Blocs » screen. It needs no render: the block's timeline runs in the page, scaled to
 * fit. Shown in a sandboxed frame, so it loads nothing from the studio.
 */
export function blockPreviewHtml(block: LoadedBlock, { width = 1080, height = 1920, gsapSrc = GSAP_SRC }: { width?: number; height?: number; gsapSrc?: string } = {}): string {
  const { manifest } = block;
  const values: Record<string, string> = { ...manifest.example };
  for (const [key, prop] of Object.entries(manifest.props)) {
    if (prop.type === "image") values[key] = placeholderImage(/logo/i.test(key) ? "Logo" : "Image");
    if (prop.type === "video") values[key] = "";
  }
  const duration = manifest.duration.default;
  const filled = fillBlock(block, values, { id: PREVIEW_ID, duration, width, height, words: sampleWords(duration) });
  const template = /<template>([\s\S]*)<\/template>/.exec(filled)?.[1] ?? filled;
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <script src="${gsapSrc}"></script>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #18181b; }
      #stage { position: absolute; left: 0; top: 0; width: ${width}px; height: ${height}px; overflow: hidden; transform-origin: 0 0; background: #2a2a2e; }
    </style>
    <script>window.__timelines = {};</script>
  </head>
  <body>
    <div id="stage">
${template.trim()}
    </div>
    <script>
      (function () {
        const stage = document.getElementById("stage");
        function fit() {
          const scale = Math.min(innerWidth / ${width}, innerHeight / ${height});
          stage.style.transform = "translate(" + (innerWidth - ${width} * scale) / 2 + "px," + (innerHeight - ${height} * scale) / 2 + "px) scale(" + scale + ")";
        }
        fit();
        addEventListener("resize", fit);
        const tl = window.__timelines["${PREVIEW_ID}"];
        if (!tl) return;
        tl.eventCallback("onComplete", function () { setTimeout(function () { tl.restart(); }, 800); });
        tl.play(0);
      })();
    </script>
  </body>
</html>
`;
}
