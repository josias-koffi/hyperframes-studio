import { describe, expect, it } from "vitest";
import { formatRelative } from "./format";

describe("formatRelative", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");

  it("says just now under a minute", () => {
    expect(formatRelative("2026-10-07T11:59:30Z", now)).toBe("à l'instant");
  });

  it("picks the largest unit", () => {
    expect(formatRelative("2026-10-07T09:00:00Z", now)).toBe("il y a 3 heures");
    expect(formatRelative("2026-10-06T12:00:00Z", now)).toBe("hier");
  });
});
