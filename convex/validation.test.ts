import { describe, expect, it } from "vitest";
import {
  normalizeBulbFields,
  normalizeOptionalHttpUrl,
  optionalText,
  requireCount,
  requireDate,
  requireText,
  requireWattage,
} from "./validation";

describe("URL validation", () => {
  it.each([undefined, "", "   "])("omits empty URL %s", (value) =>
    expect(normalizeOptionalHttpUrl(value)).toBeUndefined(),
  );
  it.each(["http://example.com", "https://example.com/x"])(
    "normalizes %s",
    (value) =>
      expect(normalizeOptionalHttpUrl(` ${value} `)).toBe(
        new URL(value).toString(),
      ),
  );
  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>",
    "ftp://example.com",
    "not a url",
    `https://${"a".repeat(3000)}`,
  ])("rejects unsafe URL %s", (value) =>
    expect(() => normalizeOptionalHttpUrl(value)).toThrow(),
  );
});

describe("input bounds", () => {
  it("trims text", () => expect(requireText("  Home  ", "Name")).toBe("Home"));
  it.each(["", "   ", "x".repeat(201)])("rejects invalid names", (value) =>
    expect(() => requireText(value, "Name")).toThrow(),
  );
  it("omits optional empty text", () =>
    expect(optionalText("  ", "Notes")).toBeUndefined());
  it.each([-1, 0.5, 100001, NaN, Infinity])(
    "rejects invalid counts %s",
    (value) => expect(() => requireCount(value, "Quantity")).toThrow(),
  );
  it.each([0, 1, 100000])("allows counts %s", (value) =>
    expect(requireCount(value, "Quantity")).toBe(value),
  );
  it.each([-1, NaN, Infinity, 10001])("rejects invalid wattage %s", (value) =>
    expect(() => requireWattage(value)).toThrow(),
  );
  it.each([0, 6.5, 10000])("allows wattage %s", (value) =>
    expect(requireWattage(value)).toBe(value),
  );
  it.each([-1, NaN, Infinity, 4102444800001])(
    "rejects invalid dates %s",
    (value) => expect(() => requireDate(value)).toThrow(),
  );
  it("normalizes bulb fields without changing unrelated fields", () =>
    expect(
      normalizeBulbFields({
        wattage: 6,
        notes: " text ",
        productName: " bulb ",
        quantity: 2,
        id: "id",
      }),
    ).toEqual({
      wattage: 6,
      notes: "text",
      productName: "bulb",
      quantity: 2,
      id: "id",
    }));
});
