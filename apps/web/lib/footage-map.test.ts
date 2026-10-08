import { describe, expect, it } from "vitest";
import { parseFootageMap } from "./footage-map";

describe("parseFootageMap", () => {
  it("lists the contact sheets, then the refined windows, with their time span", () => {
    const map = parseFootageMap(
      JSON.stringify({
        source: { duration_s: 12.5 },
        shots: [{}, {}],
        sheets: [{ path: "footage/sheets/sheet-01.png", times: [0, 0.52, 9.52] }, { path: "footage/sheets/sheet-02.png", times: [] }],
        refines: [{ path: "footage/refine/3-4-01.png", times: [3.04, 3.92] }],
        events: [],
      }),
    );
    expect(map).toEqual({
      duration: 12.5,
      shots: 2,
      sheets: [
        { path: "footage/sheets/sheet-01.png", start: 0, end: 9.52, refined: false },
        { path: "footage/refine/3-4-01.png", start: 3.04, end: 3.92, refined: true },
      ],
    });
  });

  it("ignores a missing or broken file", () => {
    expect(parseFootageMap(null)).toBeNull();
    expect(parseFootageMap("{")).toBeNull();
  });
});
