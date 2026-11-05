import { ConvexError } from "convex/values";
import {
  normalizeOptionalHttpUrl,
  optionalText,
  requireCount,
  requireDate,
  requireText,
  requireWattage,
} from "../../convex/validation";
import {
  BULB_STATUSES,
  COLOUR_TEMPERATURES,
  FIXTURE_LOCATIONS,
  ROOM_TYPES,
  SOCKET_TYPES,
} from "./entity-types";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ConvexError("Expected an object in import data");
  return value as Record<string, unknown>;
}

function children(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new ConvexError("Expected an array in import data");
  return value;
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  const match = values.find((item) => item === value);
  if (match === undefined) throw new ConvexError(`Invalid ${label}`);
  return match;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new ConvexError(`${label} must be text`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number")
    throw new ConvexError(`${label} must be a number`);
  return value;
}

function optional(value: unknown, label: string, max = 2000) {
  return value === undefined || value === null
    ? undefined
    : optionalText(text(value, label), label, max);
}

function bulbFields(value: Record<string, unknown>) {
  return {
    socketType: enumValue(value.socketType, SOCKET_TYPES, "socket type"),
    wattage: requireWattage(number(value.wattage, "Wattage")),
    colourTemperature: enumValue(
      value.colourTemperature,
      COLOUR_TEMPERATURES,
      "colour temperature",
    ),
    notes: optional(value.notes, "Notes"),
    productName: optional(value.productName, "Product name", 200),
    productUrl: normalizeOptionalHttpUrl(
      value.productUrl === undefined
        ? undefined
        : text(value.productUrl, "Product URL"),
    ),
  };
}

export function countImportEntities(value: unknown) {
  const fieldArray = (object: unknown, key: string): unknown[] => {
    if (!object || typeof object !== "object" || !(key in object)) return [];
    const field: unknown = (object as Record<string, unknown>)[key];
    return Array.isArray(field) ? field : [];
  };
  const properties = fieldArray(value, "properties");
  const rooms = properties.flatMap((property) => fieldArray(property, "rooms"));
  const fixtures = rooms.flatMap((room) => fieldArray(room, "fixtures"));
  return {
    properties: properties.length,
    rooms: rooms.length,
    fixtures: fixtures.length,
    bulbs: fixtures.reduce<number>(
      (count, fixture) => count + fieldArray(fixture, "bulbs").length,
      0,
    ),
    spareBulbs: fieldArray(value, "spareBulbs").length,
  };
}

export function parseImportData(json: string) {
  if (new TextEncoder().encode(json).byteLength > 1_000_000)
    throw new ConvexError("Import file is too large");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new ConvexError("Invalid JSON format");
  }
  const root = record(value);
  if (root.version !== 1)
    throw new ConvexError("Unsupported export format. Expected version 1.");
  const counts = countImportEntities(root);
  if (
    counts.properties > 200 ||
    counts.rooms > 5_000 ||
    counts.fixtures > 20_000 ||
    counts.bulbs > 50_000 ||
    counts.spareBulbs > 5_000
  )
    throw new ConvexError("Import exceeds entity limits");
  return {
    version: 1,
    properties: children(root.properties).map((value) => {
      const property = record(value);
      return {
        name: requireText(
          text(property.name, "Property name"),
          "Property name",
        ),
        rooms: children(property.rooms).map((value) => {
          const room = record(value);
          return {
            name: requireText(text(room.name, "Room name"), "Room name"),
            roomType: enumValue(room.roomType, ROOM_TYPES, "room type"),
            fixtures: children(room.fixtures).map((value) => {
              const fixture = record(value);
              return {
                name: optional(fixture.name, "Fixture name", 200),
                location: enumValue(
                  fixture.location,
                  FIXTURE_LOCATIONS,
                  "fixture location",
                ),
                notes: optional(fixture.notes, "Notes"),
                bulbs: children(fixture.bulbs).map((value) => {
                  const bulb = record(value);
                  const features = children(bulb.features).map((value) =>
                    requireText(text(value, "Feature"), "Feature", 100),
                  );
                  if (features.length > 50)
                    throw new ConvexError("Too many bulb features");
                  return {
                    ...bulbFields(bulb),
                    features,
                    installDate:
                      bulb.installDate === undefined
                        ? Date.now()
                        : requireDate(number(bulb.installDate, "Install date")),
                    status: enumValue(
                      bulb.status,
                      BULB_STATUSES,
                      "bulb status",
                    ),
                  };
                }),
              };
            }),
          };
        }),
      };
    }),
    spareBulbs: children(root.spareBulbs).map((value) => {
      const spare = record(value);
      return {
        ...bulbFields(spare),
        quantity: requireCount(number(spare.quantity, "Quantity"), "Quantity"),
      };
    }),
  };
}
