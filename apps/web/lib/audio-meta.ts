/** What the media step left in `audio_meta.json` (written by the workspace's `scripts/audio.mjs`). */
export type AudioTracks = {
  music: { path: string; duration: number | null; prompt: string | null } | null;
  voices: { frame: number; path: string; text: string }[];
};

type RawMeta = {
  bgm?: { path?: unknown; duration_s?: unknown; query?: unknown } | null;
  voices?: { frame?: unknown; path?: unknown; text?: unknown; words?: { text?: unknown }[] }[];
};

export function parseAudioMeta(raw: string | null): AudioTracks | null {
  if (!raw) return null;
  let meta: RawMeta;
  try {
    meta = JSON.parse(raw) as RawMeta;
  } catch {
    return null;
  }
  const bgm = meta.bgm && typeof meta.bgm.path === "string" ? meta.bgm : null;
  return {
    music: bgm
      ? {
          path: bgm.path as string,
          duration: typeof bgm.duration_s === "number" ? bgm.duration_s : null,
          prompt: typeof bgm.query === "string" ? bgm.query : null,
        }
      : null,
    voices: (meta.voices ?? [])
      .filter((voice) => typeof voice.path === "string")
      .map((voice, index) => ({
        frame: typeof voice.frame === "number" ? voice.frame : index + 1,
        path: voice.path as string,
        // The voice text is only stored word by word.
        text:
          typeof voice.text === "string"
            ? voice.text
            : (voice.words ?? []).map((word) => (typeof word.text === "string" ? word.text : "")).join(" ").trim(),
      })),
  };
}
