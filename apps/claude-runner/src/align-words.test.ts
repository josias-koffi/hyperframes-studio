import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Word = { text: string; start: number; end: number };
const { alignWords } = (await import(join(__dirname, "../../../workspace/scripts/align-words.mjs"))) as {
  alignWords: (want: string[], heard: Word[]) => Word[];
};

describe("alignWords (scripts/audio.mjs)", () => {
  it("keeps the script's words when whisper hears them the same", () => {
    const heard = [
      { text: "bonjour", start: 0, end: 0.4 },
      { text: "à", start: 0.4, end: 0.5 },
      { text: "tous", start: 0.5, end: 0.9 },
    ];
    expect(alignWords(["Bonjour", "à", "tous."], heard)).toEqual([
      { text: "Bonjour", start: 0, end: 0.4 },
      { text: "à", start: 0.4, end: 0.5 },
      { text: "tous.", start: 0.5, end: 0.9 },
    ]);
  });

  it("keeps a name whisper cut in two, over the time of both heard words", () => {
    const heard = [
      { text: "Lance-toi", start: 0.1, end: 0.6 },
      { text: "avec", start: 0.6, end: 0.8 },
      { text: "Frême", start: 0.85, end: 1.2 },
      { text: "Smith!", start: 1.2, end: 1.7 },
    ];
    expect(alignWords(["Lance-toi", "avec", "Framesmith."], heard)).toEqual([
      { text: "Lance-toi", start: 0.1, end: 0.6 },
      { text: "avec", start: 0.6, end: 0.8 },
      { text: "Framesmith.", start: 0.85, end: 1.7 },
    ]);
  });

  it("shares a heard word between the script words it stands for, in order", () => {
    const words = alignWords(["Il", "est", "dix-sept", "heures"], [
      { text: "Il", start: 0, end: 0.2 },
      { text: "est", start: 0.2, end: 0.4 },
      { text: "17h", start: 0.4, end: 1 },
    ]);
    expect(words.map((word) => word.text)).toEqual(["Il", "est", "dix-sept", "heures"]);
    for (let i = 1; i < words.length; i++) expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].start);
    expect(words[3].end).toBeLessThanOrEqual(1);
  });
});
