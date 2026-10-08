import { describe, expect, it } from "vitest";
import { pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("lists every page when there are few", () => {
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  });

  it("marks the gaps around the current page", () => {
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
  });

  it("has no gap next to the first or last page", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, null, 10]);
    expect(pageWindow(10, 10)).toEqual([1, null, 9, 10]);
  });
});
