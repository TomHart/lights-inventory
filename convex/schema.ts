import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const roomTypes = v.union(
    v.literal("living_room"),
    v.literal("bedroom"),
    v.literal("kitchen"),
    v.literal("bathroom"),
    v.literal("dining_room"),
    v.literal("office"),
    v.literal("hallway"),
    v.literal("garage"),
    v.literal("basement"),
    v.literal("attic"),
    v.literal("laundry"),
    v.literal("closet"),
    v.literal("outdoor"),
    v.literal("other"),
);

export const fixtureLocations = v.union(
    v.literal("ceiling"),
    v.literal("wall"),
    v.literal("floor"),
    v.literal("table"),
    v.literal("desk"),
    v.literal("under_cabinet"),
    v.literal("recessed"),
    v.literal("track"),
    v.literal("pendant"),
    v.literal("chandelier"),
    v.literal("sconce"),
    v.literal("outdoor"),
    v.literal("other"),
);

export const socketTypes = v.union(
    v.literal("E26"),
    v.literal("E12"),
    v.literal("E17"),
    v.literal("E39"),
    v.literal("GU10"),
    v.literal("GU24"),
    v.literal("MR16"),
    v.literal("G4"),
    v.literal("G9"),
    v.literal("T8"),
    v.literal("T5"),
    v.literal("PAR20"),
    v.literal("PAR30"),
    v.literal("PAR38"),
    v.literal("other"),
);

export const bulbStatuses = v.union(
    v.literal("working"),
    v.literal("flickering"),
    v.literal("dead"),
);

export const colourTemperatures = v.union(
    v.literal("warm"),
    v.literal("cool"),
    v.literal("daylight"),
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
