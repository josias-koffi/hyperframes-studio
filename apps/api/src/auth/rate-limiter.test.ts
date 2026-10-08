import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  it("allows the limit per window, then refuses until the window ends", () => {
    const limiter = new RateLimiter(2, 1000);
    expect([limiter.hit("a", 0), limiter.hit("a", 10), limiter.hit("a", 20)]).toEqual([true, true, false]);
    expect(limiter.hit("b", 20)).toBe(true);
    expect(limiter.hit("a", 1000)).toBe(true);
  });
});
