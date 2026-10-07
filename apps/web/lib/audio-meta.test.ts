import { describe, expect, it } from "vitest";
import { parseAudioMeta } from "./audio-meta";

describe("parseAudioMeta", () => {
  it("reads the music bed and rebuilds each voice's text from its words", () => {
    const tracks = parseAudioMeta(
      JSON.stringify({
        bgm: { path: "assets/audio/music/bgm.mp3", duration_s: 20.1, query: "soft pads" },
        voices: [{ frame: 1, path: "assets/audio/voice/01.wav", words: [{ text: "Une" }, { text: "idée" }] }],
      }),
    );
    expect(tracks).toEqual({
      music: { path: "assets/audio/music/bgm.mp3", duration: 20.1, prompt: "soft pads" },
      voices: [{ frame: 1, path: "assets/audio/voice/01.wav", text: "Une idée" }],
    });
  });

  it("returns null without a file or with broken JSON", () => {
    expect(parseAudioMeta(null)).toBeNull();
    expect(parseAudioMeta("{")).toBeNull();
  });

  it("handles a silent video", () => {
    expect(parseAudioMeta("{}")).toEqual({ music: null, voices: [] });
  });
});
