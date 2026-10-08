import { describe, expect, it } from "vitest";
import { compositionDuration, contentTypeOf, planRender, postFrameTimes, sortShots } from "./render-args";

const base = { jobId: "00000000-0000-4000-8000-000000000000", creationId: "00000000-0000-4000-8000-000000000001", slug: "demo" };

describe("planRender", () => {
  it("renders a template video with strict variables", () => {
    const plan = planRender({ ...base, format: "mp4", variables: { title: "x" } }, { dir: "videos/demo", outDir: "/tmp/o", variablesFile: "/tmp/v.json" });
    expect(plan.args).toEqual([
      "render", "videos/demo", "-o", "/tmp/o/demo.mp4", "--format", "mp4", "--variables-file", "/tmp/v.json", "--strict-variables",
    ]);
    expect(plan.outputs).toEqual(["/tmp/o/demo.mp4"]);
  });

  it("captures post images with snapshot --at", () => {
    const plan = planRender({ ...base, format: "png", at: [1.5, 4] }, { dir: "videos/demo", outDir: "/tmp/o" });
    expect(plan.args).toEqual(["snapshot", "videos/demo", "-o", "/tmp/o", "--at", "1.5,4", "--no-end", "--describe", "false"]);
  });

  it("captures the slides of a carousel the same way", () => {
    const plan = planRender({ ...base, format: "pdf", at: [0.5, 1.5, 2.5] }, { dir: "videos/demo", outDir: "/tmp/o" });
    expect(plan.args).toEqual(["snapshot", "videos/demo", "-o", "/tmp/o", "--at", "0.5,1.5,2.5", "--no-end", "--describe", "false"]);
    expect(plan.outputs).toEqual([]);
  });
});

describe("outputs", () => {
  it("orders snapshots by capture index", () => {
    const files = ["frame-10-at-10.5s.png", "contact-sheet.jpg", "frame-2-at-2.5s.png", "frame-00-at-0.5s.png"];
    expect(sortShots(files)).toEqual(["frame-00-at-0.5s.png", "frame-2-at-2.5s.png", "frame-10-at-10.5s.png"]);
  });

  it("types each file by its extension", () => {
    expect(contentTypeOf("/tmp/o/slide-01.png")).toBe("image/png");
    expect(contentTypeOf("/tmp/o/demo.pdf")).toBe("application/pdf");
    expect(contentTypeOf("/tmp/o/demo.mp4")).toBe("video/mp4");
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
