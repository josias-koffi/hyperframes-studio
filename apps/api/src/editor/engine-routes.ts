/**
 * What the editor may ask the HyperFrames engine (apps/hf-studio), relative to `/api/projects/<slug>/`: the routes
 * of the pinned CLI it is built on (checked by `apps/hf-studio/src/studio-cli.test.ts`). Anything else, such as the
 * engine's own renders or registry installs, stays out of reach.
 */
const READS = [
  /^$/,
  /^preview(\/.*)?$/,
  /^files\/.+$/,
  /^(image-)?thumbnail\/.+$/,
  /^(waveform|peaks)\/.+$/,
  /^media\/metadata$/,
];
// The editor computes its edits itself and writes files whole.
const WRITES: Record<string, RegExp[]> = {
  PUT: [/^files\/.+$/],
};

export type EngineRoute = { upstream: string; writes: boolean };

/** Where a request of the editor goes on the engine, or `null` when it is not allowed. */
export function engineRoute(method: string, path: string, slug: string): EngineRoute | null {
  if (path.split("/").some((segment) => segment === ".." || segment === ".")) return null;
  if (method === "GET" || method === "HEAD") {
    if (path === "runtime.js") return { upstream: "/api/runtime.js", writes: false };
    return READS.some((pattern) => pattern.test(path)) ? { upstream: `/api/projects/${slug}${path ? `/${path}` : ""}`, writes: false } : null;
  }
  return WRITES[method]?.some((pattern) => pattern.test(path)) ? { upstream: `/api/projects/${slug}/${path}`, writes: true } : null;
}

/**
 * A preview page names the engine's paths (`<base href="/api/projects/<slug>/preview/">`, `/api/runtime.js`): they
 * are rewritten to the API's engine route, so the page loads everything through it from the editor's origin.
 */
export function rewritePreview(html: string, slug: string, base: string): string {
  return html.split(`/api/projects/${slug}/`).join(`${base}/`).split('"/api/runtime.js"').join(`"${base}/runtime.js"`);
}
