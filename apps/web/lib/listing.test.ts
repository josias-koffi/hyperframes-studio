import { describe, expect, it } from "vitest";
import { fold, listHref, matches, paginate, param } from "./listing";

describe("listing", () => {
  it("folds case and accents", () => {
    expect(fold("Été Démo")).toBe("ete demo");
    expect(matches("demo", "Démo multi-formats")).toBe(true);
    expect(matches("", "anything")).toBe(true);
    expect(matches("logo", "fond.png", null)).toBe(false);
  });

  it("clamps the page", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    expect(paginate(items, "2", 12)).toEqual({ shown: items.slice(12, 24), page: 2, pages: 3 });
    expect(paginate(items, "99", 12).page).toBe(3);
    expect(paginate(items, "abc", 12).page).toBe(1);
    expect(paginate([], undefined, 12)).toEqual({ shown: [], page: 1, pages: 1 });
  });

  it("builds URLs with the set parameters only", () => {
    expect(listHref("/templates", { q: "promo", project: undefined, page: 1 })).toBe("/templates?q=promo");
    expect(listHref("/templates", { q: "", page: 3 })).toBe("/templates?page=3");
    expect(listHref("/assets", {})).toBe("/assets");
  });

  it("reads one value of a parameter", () => {
    expect(param([" a ", "b"])).toBe("a");
    expect(param(undefined)).toBe("");
  });
});
