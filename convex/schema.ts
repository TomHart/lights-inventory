import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  BULB_STATUSES,
  COLOUR_TEMPERATURES,
  FIXTURE_LOCATIONS,
  ROOM_TYPES,
  SOCKET_TYPES,
} from "../src/lib/entity-types";

export const roomTypes = v.union(
  ...ROOM_TYPES.map((value) => v.literal(value)),
);
export const fixtureLocations = v.union(
  ...FIXTURE_LOCATIONS.map((value) => v.literal(value)),
);
export const socketTypes = v.union(
  ...SOCKET_TYPES.map((value) => v.literal(value)),
);
export const bulbStatuses = v.union(
  ...BULB_STATUSES.map((value) => v.literal(value)),
);
export const colourTemperatures = v.union(
  ...COLOUR_TEMPERATURES.map((value) => v.literal(value)),
);

export default defineSchema({
  ...authTables,

  properties: defineTable({
    userId: v.id("users"),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  rooms: defineTable({
    propertyId: v.id("properties"),
    name: v.string(),
    roomType: roomTypes,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_propertyId", ["propertyId"]),

  fixtures: defineTable({
    roomId: v.id("rooms"),
    name: v.optional(v.string()),
    location: fixtureLocations,
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_roomId", ["roomId"]),

  bulbs: defineTable({
    fixtureId: v.id("fixtures"),
    socketType: socketTypes,
    features: v.array(v.string()),
    installDate: v.number(),
    status: bulbStatuses,
    wattage: v.number(),
    colourTemperature: colourTemperatures,
    notes: v.optional(v.string()),
    productName: v.optional(v.string()),
    productUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_fixtureId", ["fixtureId"])
    .index("by_status", ["status"]),

  reminders: defineTable({
    userId: v.id("users"),
    bulbId: v.id("bulbs"),
    reminderDate: v.number(),
    message: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_bulbId", ["bulbId"])
    .index("by_userId_active", ["userId", "isActive"]),

  maintenanceLogs: defineTable({
    userId: v.id("users"),
    fixtureId: v.optional(v.id("fixtures")),
    bulbId: v.optional(v.id("bulbs")),
    action: v.string(),
    notes: v.optional(v.string()),
    date: v.number(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_fixtureId", ["fixtureId"])
    .index("by_bulbId", ["bulbId"]),

  spareBulbs: defineTable({
    userId: v.id("users"),
    socketType: socketTypes,
    wattage: v.number(),
    colourTemperature: colourTemperatures,
    quantity: v.number(),
    productName: v.optional(v.string()),
    productUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_updatedAt", ["updatedAt"]),
});
