import { describe, expect, it } from "vitest";
import { countImportEntities, parseImportData } from "./import-data";

const bulb = {
  socketType: "E26",
  wattage: 6,
  colourTemperature: "warm",
  status: "working",
  features: [],
  installDate: 1,
};
const valid = {
  version: 1,
  properties: [
    {
      name: " Home ",
      rooms: [
        {
          name: "Room",
          roomType: "bedroom",
          fixtures: [{ location: "ceiling", bulbs: [bulb, bulb] }],
        },
      ],
    },
  ],
  spareBulbs: [
    { socketType: "E26", wattage: 6, colourTemperature: "warm", quantity: 2 },
  ],
};

describe("import counting", () => {
  it.each([undefined, null, {}, { properties: "wrong", spareBulbs: {} }])(
    "handles empty and non-array data",
    (value) =>
      expect(countImportEntities(value)).toEqual({
        properties: 0,
        rooms: 0,
        fixtures: 0,
        bulbs: 0,
        spareBulbs: 0,
      }),
  );
  it("counts nested entities", () =>
    expect(countImportEntities(valid)).toEqual({
      properties: 1,
      rooms: 1,
      fixtures: 1,
      bulbs: 2,
      spareBulbs: 1,
    }));
  it("ignores malformed children when previewing", () =>
    expect(
      countImportEntities({
        properties: [
          null,
          { rooms: [null, { fixtures: [null, { bulbs: [null] }] }] },
        ],
      }),
    ).toEqual({
      properties: 2,
      rooms: 2,
      fixtures: 2,
      bulbs: 1,
      spareBulbs: 0,
    }));
});

describe("import parsing", () => {
  it("trims names and preserves valid values", () => {
    const parsed = parseImportData(JSON.stringify(valid));
    expect(parsed.properties[0].name).toBe("Home");
    expect(parsed.properties[0].rooms[0].fixtures[0].bulbs[0].wattage).toBe(6);
  });
  it.each([
    "bad JSON",
    "null",
    "[]",
    "{}",
    '{"version":2}',
    '{"version":1,"properties":{}}',
    '{"version":1,"properties":[null]}',
    '{"version":1,"properties":[{"name":" "}]}',
  ])("rejects malformed payload %s", (json) =>
    expect(() => parseImportData(json)).toThrow(),
  );
  it("rejects oversized payloads", () =>
    expect(() => parseImportData(" ".repeat(1_000_001))).toThrow("too large"));
  it("rejects excess entity counts", () =>
    expect(() =>
      parseImportData(
        JSON.stringify({
          version: 1,
          properties: Array.from({ length: 201 }, () => ({ name: "Home" })),
        }),
      ),
    ).toThrow("entity limits"));
  it.each([
    { wattage: -1 },
    { wattage: 1e100 },
    { socketType: "invalid" },
    { status: "invalid" },
    { colourTemperature: "invalid" },
    { productUrl: "javascript:alert(1)" },
    { features: [123] },
    { notes: "x".repeat(2001) },
    { installDate: -1 },
  ])("rejects invalid bulbs", (changes) => {
    const payload = structuredClone(valid);
    Object.assign(payload.properties[0].rooms[0].fixtures[0].bulbs[0], changes);
    expect(() => parseImportData(JSON.stringify(payload))).toThrow();
  });
});
