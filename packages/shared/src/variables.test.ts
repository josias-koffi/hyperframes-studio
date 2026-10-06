import { describe, expect, it } from "vitest";
import { applyVariableDefaults, parseCompositionVariables, validateVariableValues } from "./variables";

const html = `<html data-composition-variables='[
  {"id":"title","type":"string","label":"Titre","default":"Hello","maxLength":10},
  {"id":"accent","type":"color","label":"Accent","default":"#66d9ef"},
  {"id":"layout","type":"enum","label":"Mise en page","default":"a","options":[{"value":"a","label":"A"}]}
]'><body></body></html>`;

describe("parseCompositionVariables", () => {
  it("reads the declarations of the root element", () => {
    const variables = parseCompositionVariables(html);
    expect(variables.map((v) => v.id)).toEqual(["title", "accent", "layout"]);
  });

  it("decodes an attribute written with HTML entities", () => {
    const encoded = `<html data-composition-variables="[{&quot;id&quot;:&quot;n&quot;,&quot;type&quot;:&quot;number&quot;,&quot;label&quot;:&quot;N&quot;,&quot;default&quot;:1}]">`;
    expect(parseCompositionVariables(encoded)).toEqual([{ id: "n", type: "number", label: "N", default: 1 }]);
  });

  it("returns nothing for a composition without variables", () => {
    expect(parseCompositionVariables("<html><body></body></html>")).toEqual([]);
  });
});

describe("validateVariableValues", () => {
  const declarations = parseCompositionVariables(html);

  it("accepts matching values", () => {
    expect(validateVariableValues(declarations, { title: "Promo", accent: "#fff", layout: "a" })).toEqual([]);
  });

  it("reports undeclared keys, wrong types and bad enum values", () => {
    expect(validateVariableValues(declarations, { nope: 1, title: 3, layout: "z" })).toEqual([
      "nope: undeclared variable",
      "title: expected a string",
      "layout: not one of the options",
    ]);
  });

  it("enforces maxLength", () => {
    expect(validateVariableValues(declarations, { title: "x".repeat(11) })).toEqual(["title: longer than 10"]);
  });
});

describe("applyVariableDefaults", () => {
  it("rewrites the defaults and keeps the rest of the document", () => {
    const rewritten = applyVariableDefaults(html, { title: "L'été & co", layout: "a" });
    expect(rewritten).toContain("<body></body></html>");
    const variables = parseCompositionVariables(rewritten);
    expect(variables.find((v) => v.id === "title")?.default).toBe("L'été & co");
    expect(variables.find((v) => v.id === "accent")?.default).toBe("#66d9ef");
  });

  it("leaves a composition without variables untouched", () => {
    expect(applyVariableDefaults("<html></html>", { a: 1 })).toBe("<html></html>");
  });
});
