import type { RenderJob } from "@studio/shared";

export type RenderPlan = { args: string[]; outputs: string[]; contentType: string };

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  gif: "image/gif",
  png: "image/png",
};

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
 * its composition); PNGs for social posts go through `snapshot --at`.
 */
export function planRender(job: RenderJob, opts: { dir: string; outDir: string; variablesFile?: string }): RenderPlan {
  const contentType = CONTENT_TYPES[job.format];
  if (job.format === "png") {
    const at = job.at?.length ? job.at : [0];
    return {
      args: ["snapshot", opts.dir, "-o", opts.outDir, "--at", at.join(","), "--no-end", "--describe", "false"],
      outputs: [],
      contentType,
    };
  }
  const output = `${opts.outDir}/${job.slug}.${job.format}`;
  const args = ["render", opts.dir, "-o", output, "--format", job.format];
  if (opts.variablesFile) args.push("--variables-file", opts.variablesFile, "--strict-variables");
  return { args, outputs: [output], contentType };
}
