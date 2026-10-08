/**
 * A project is a campaign; what it contains are créations. Each one is its own
 * HyperFrames folder (`videos/<slug>`), its own Claude session and pipeline, and
 * ends in one kind of deliverable: a video, a carousel of slides or a single image.
 */
export const CREATION_TYPES = ["video", "carousel", "image"] as const;
export type CreationType = (typeof CREATION_TYPES)[number];

/**
 * A one-shot création is made once; a template is built around variables the
 * user validates before the composition, then instantiated without Claude.
 */
export const CREATION_KINDS = ["oneshot", "template"] as const;
export type CreationKind = (typeof CREATION_KINDS)[number];

/** Canvas presets, in pixels. 4:5 is the portrait feed format of Instagram and LinkedIn. */
export const ASPECTS = {
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
} as const;
export type Aspect = keyof typeof ASPECTS;

export const ASPECTS_BY_TYPE: Record<CreationType, readonly Aspect[]> = {
  video: ["9:16", "4:5", "1:1", "16:9"],
  carousel: ["4:5", "1:1"],
  image: ["4:5", "1:1", "9:16", "16:9"],
};

export function aspectOf(width: number | null | undefined, height: number | null | undefined): Aspect | null {
  const found = Object.entries(ASPECTS).find(([, size]) => size.width === width && size.height === height);
  return found ? (found[0] as Aspect) : null;
}

export const SLIDE_COUNT = { min: 2, max: 20, default: 5 } as const;

/**
 * A still is a composition captured at a fixed time: an image is a 1 s composition
 * captured at 0.5 s, slide `i` of a carousel is a 1 s clip starting at `i`.
 */
export const STILL_TIME = 0.5;

export function carouselTimes(slides: number): number[] {
  return Array.from({ length: slides }, (_, index) => index + STILL_TIME);
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}
