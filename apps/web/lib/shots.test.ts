import { describe, expect, it } from "vitest";
import { estimateOf, parseShots } from "./shots";

const storyboard = JSON.stringify({
  scenes: [
    { id: "s1", title: "Tasse", duration: 5, shot: { prompt: "A cup", camera: "dolly", audio: false } },
    { id: "s2", title: "Fin", duration: 3 },
    { id: "s3", title: "Grains", duration: 4, shot: { prompt: "Beans", audio: true } },
  ],
});
const meta = JSON.stringify({
  spentUsd: 0.6,
  budgetUsd: 5.5,
  scenes: { s1: { keyframe: { model: "fal-ai/flux/schnell", status: "ok", costUsd: 0.003 } } },
  estimate: {
    s1: { keyframe: { usd: 0.003, priced: true }, draft: { usd: 0.5, priced: true }, final: { usd: 2, priced: true } },
    s3: { keyframe: { usd: 0.003, priced: true }, draft: { usd: 0.5, priced: true }, final: null },
  },
});

describe("parseShots", () => {
  it("lists the generated shots with what was made of them and the budget", () => {
    const data = parseShots(storyboard, meta, null)!;
    expect(data.shots.map((shot) => [shot.id, shot.camera, shot.audio, shot.keyframe?.status ?? null])).toEqual([
      ["s1", "dolly", false, "ok"],
      ["s3", "", true, null],
    ]);
    expect([data.spentUsd, data.budgetUsd, data.blocked]).toEqual([0.6, 5.5, null]);
    expect(parseShots(null, meta, null)).toBeNull();
    expect(parseShots(storyboard, "{oops", '{"step":"shots","only":["s1"]}')!.blocked).toMatchObject({ step: "shots" });
  });

  it("adds up an estimate and flags a model without price", () => {
    const { shots } = parseShots(storyboard, meta, null)!;
    expect(estimateOf(shots, "draft")).toEqual({ usd: 1, unpriced: false });
    expect(estimateOf(shots, "final")).toEqual({ usd: 2, unpriced: true });
  });
});
