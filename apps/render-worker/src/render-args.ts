import type { RenderFormat, RenderJob } from "@studio/shared";

/** `outputs` is empty for stills: the worker collects the snapshots it finds. */
export type RenderPlan = { args: string[]; outputs: string[] };

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  gif: "image/gif",
  png: "image/png",
  pdf: "application/pdf",
};

/**
 * The HyperFrames CLI command: words split on spaces (`npx --yes hyperframes@<version>`), or a JSON array, whose
 * items may hold spaces (the app's Node and CLI under `Application Support`, `Program Files`).
 */
export function hyperframesCommand(value: string | undefined): string[] {
  const command = value?.trim() || "hyperframes";
  if (!command.startsWith("[")) return command.split(/\s+/);
  const parsed: unknown = JSON.parse(command);
  if (!Array.isArray(parsed) || !parsed.length || !parsed.every((part) => typeof part === "string")) {
    throw new Error(`HYPERFRAMES_BIN: expected a JSON array of strings, got ${command}`);
  }
  return parsed;
}

export function contentTypeOf(file: string): string {
  return CONTENT_TYPES[file.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** PNG images and carousels (PNG slides + one PDF) are captured with `snapshot`, not rendered. */
export function isStill(format: RenderFormat): boolean {
  return format === "png" || format === "pdf";
}

/**
 * Snapshot files in capture order. `snapshot` names them `frame-<index>-at-<t>s.png`; the index is
 * compared as a number, so slide 10 never comes before slide 2.
 */
export function sortShots(files: string[]): string[] {
  const index = (file: string) => Number(/^frame-(\d+)/.exec(file)?.[1] ?? Number.MAX_SAFE_INTEGER);
  return files.filter((file) => file.endsWith(".png")).sort((a, b) => index(a) - index(b) || a.localeCompare(b));
}

/** `data-duration` of the root composition of an index.html, in seconds. */
export function compositionDuration(html: string): number | null {
  const match = /data-duration="([\d.]+)"/.exec(html);
  const duration = match ? Number.parseFloat(match[1]) : Number.NaN;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

/**
 * Post images spread over the video, the last one near the end. Never t=0: the first frame of a
 * motion piece is usually empty, its elements not animated in yet.
 */
export function postFrameTimes(duration: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round(((i + 1) / count) * duration * 0.95 * 100) / 100);
}

/**
 * `hyperframes` CLI arguments for one render job. Videos go through `render`
 * (with `--strict-variables` so a template form can never silently drift from
 * its composition); PNGs and carousel slides go through `snapshot --at`.
 */
export function planRender(job: RenderJob, opts: { dir: string; outDir: string; variablesFile?: string }): RenderPlan {
  if (isStill(job.format)) {
    const at = job.at?.length ? job.at : [0];
    return {
      args: ["snapshot", opts.dir, "-o", opts.outDir, "--at", at.join(","), "--no-end", "--describe", "false"],
      outputs: [],
    };
  }
  const output = `${opts.outDir}/${job.slug}.${job.format}`;
  const args = ["render", opts.dir, "-o", output, "--format", job.format];
  if (opts.variablesFile) args.push("--variables-file", opts.variablesFile, "--strict-variables");
  return { args, outputs: [output] };
}
