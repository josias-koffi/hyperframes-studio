import { describe, expect, it } from "vitest";
import { compositionDuration, planRender, postFrameTimes } from "./render-args";

const base = { jobId: "00000000-0000-4000-8000-000000000000", projectId: "00000000-0000-4000-8000-000000000001", slug: "demo" };

describe("planRender", () => {
  it("renders a template video with strict variables", () => {
    const plan = planRender({ ...base, format: "mp4", variables: { title: "x" } }, { dir: "videos/demo", outDir: "/tmp/o", variablesFile: "/tmp/v.json" });
    expect(plan.args).toEqual([
      "render", "videos/demo", "-o", "/tmp/o/demo.mp4", "--format", "mp4", "--variables-file", "/tmp/v.json", "--strict-variables",
    ]);
    expect(plan.outputs).toEqual(["/tmp/o/demo.mp4"]);
    expect(plan.contentType).toBe("video/mp4");
  });

  it("captures post images with snapshot --at", () => {
    const plan = planRender({ ...base, format: "png", at: [1.5, 4] }, { dir: "videos/demo", outDir: "/tmp/o" });
    expect(plan.args).toEqual(["snapshot", "videos/demo", "-o", "/tmp/o", "--at", "1.5,4", "--no-end", "--describe", "false"]);
  });
});

describe("post images", () => {
  it("reads the root composition duration", () => {
    expect(compositionDuration('<div data-composition-id="main" data-start="0" data-duration="8">')).toBe(8);
    expect(compositionDuration("<div></div>")).toBeNull();
  });

  it("spreads the frames over the video without t=0", () => {
    expect(postFrameTimes(8, 3)).toEqual([2.53, 5.07, 7.6]);
    expect(postFrameTimes(10, 1)).toEqual([9.5]);
  });
});
