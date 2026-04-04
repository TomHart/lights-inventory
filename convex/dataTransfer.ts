import { getVerifiedUserId } from "./auth.helpers";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { enforceRateLimit } from "./rateLimit";
import { normalizeOptionalHttpUrl } from "./validation";

const MAX_IMPORT_BYTES = 1_000_000;
const MAX_IMPORT_PROPERTIES = 200;
const MAX_IMPORT_ROOMS = 5_000;
const MAX_IMPORT_FIXTURES = 20_000;
const MAX_IMPORT_BULBS = 50_000;
const MAX_IMPORT_SPARES = 5_000;

/**
 * Export all inventory data for the current user as a hierarchical JSON structure.
 * Strips internal IDs and timestamps — the output is portable and can be re-imported.
 */
export const exportAll = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) return null;

        const properties = await ctx.db
            .query("properties")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect();

        const exportedProperties = [];

        for (const property of properties) {
            const rooms = await ctx.db
                .query("rooms")
                .withIndex("by_propertyId", (q) =>
                    q.eq("propertyId", property._id),
                )
                .collect();

            const exportedRooms = [];

            for (const room of rooms) {
                const fixtures = await ctx.db
                    .query("fixtures")
                    .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
                    .collect();

                const exportedFixtures = [];

                for (const fixture of fixtures) {
                    const bulbs = await ctx.db
                        .query("bulbs")
                        .withIndex("by_fixtureId", (q) =>
                            q.eq("fixtureId", fixture._id),
                        )
                        .collect();

                    exportedFixtures.push({
                        name: fixture.name,
                        location: fixture.location,
                        notes: fixture.notes,
                        bulbs: bulbs.map((bulb) => ({
                            socketType: bulb.socketType,
                            features: bulb.features,
                            installDate: bulb.installDate,
                            status: bulb.status,
                            wattage: bulb.wattage,
                            colourTemperature: bulb.colourTemperature,
                            notes: bulb.notes,
                            productName: bulb.productName,
                            productUrl: bulb.productUrl,
                        })),
                    });
                }

                exportedRooms.push({
                    name: room.name,
                    roomType: room.roomType,
                    fixtures: exportedFixtures,
                });
            }

            exportedProperties.push({
                name: property.name,
                rooms: exportedRooms,
            });
        }

        const spareBulbs = await ctx.db
            .query("spareBulbs")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect();

        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            properties: exportedProperties,
            spareBulbs: spareBulbs.map((spare) => ({
                socketType: spare.socketType,
                wattage: spare.wattage,
                colourTemperature: spare.colourTemperature,
                quantity: spare.quantity,
                productName: spare.productName,
                productUrl: spare.productUrl,
                notes: spare.notes,
            })),
        };
    },
});

// ── Validation helpers ──────────────────────────────────────────────────

const VALID_ROOM_TYPES = new Set([
    "living_room",
    "bedroom",
    "kitchen",
    "bathroom",
    "dining_room",
    "office",
    "hallway",
    "garage",
    "basement",
    "attic",
    "laundry",
    "closet",
    "outdoor",
    "other",
]);

const VALID_FIXTURE_LOCATIONS = new Set([
    "ceiling",
    "wall",
    "floor",
    "table",
    "desk",
    "under_cabinet",
    "recessed",
    "track",
    "pendant",
    "chandelier",
    "sconce",
    "outdoor",
    "other",
]);

const VALID_SOCKET_TYPES = new Set([
    "E26",
    "E12",
    "E17",
    "E39",
    "GU10",
    "GU24",
    "MR16",
    "G4",
    "G9",
    "T8",
    "T5",
    "PAR20",
    "PAR30",
    "PAR38",
    "other",
]);

const VALID_STATUSES = new Set(["working", "flickering", "dead"]);
const VALID_COLOUR_TEMPS = new Set(["warm", "cool", "daylight"]);

function countImportEntities(parsed: any): {
    properties: number;
    rooms: number;
    fixtures: number;
    bulbs: number;
    spareBulbs: number;
} {
    const properties = Array.isArray(parsed?.properties) ? parsed.properties : [];
    const spareBulbs = Array.isArray(parsed?.spareBulbs) ? parsed.spareBulbs : [];

    let rooms = 0;
    let fixtures = 0;
    let bulbs = 0;

    for (const property of properties) {
        const propertyRooms = Array.isArray(property?.rooms) ? property.rooms : [];
        rooms += propertyRooms.length;
        for (const room of propertyRooms) {
            const roomFixtures = Array.isArray(room?.fixtures) ? room.fixtures : [];
            fixtures += roomFixtures.length;
            for (const fixture of roomFixtures) {
                const fixtureBulbs = Array.isArray(fixture?.bulbs) ? fixture.bulbs : [];
                bulbs += fixtureBulbs.length;
            }
        }
    }

    return {
        properties: properties.length,
        rooms,
        fixtures,
        bulbs,
        spareBulbs: spareBulbs.length,
    };
}

/**
 * Import inventory data from a JSON string (produced by exportAll).
 * The import is additive — existing data is not deleted or modified.
 * The entire operation is atomic: if any validation fails, nothing is written.
 */
export const importAll = mutation({
    args: {
        data: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        await enforceRateLimit(ctx, {
            key: `importAll:${userId}`,
            limit: 5,
            windowMs: 60 * 60 * 1000,
            errorMessage: "Too many imports. Please wait and try again later.",
        });

        if (args.data.length > MAX_IMPORT_BYTES) {
            throw new Error("Import file is too large");
        }

        let parsed: any;
        try {
            parsed = JSON.parse(args.data);
        } catch {
            throw new Error("Invalid JSON format");
        }

        if (!parsed.version || parsed.version !== 1) {
            throw new Error(
                "Unsupported export format. Expected version 1.",
            );
        }

        const counts = countImportEntities(parsed);
        if (counts.properties > MAX_IMPORT_PROPERTIES) {
            throw new Error("Import exceeds property limit");
        }
        if (counts.rooms > MAX_IMPORT_ROOMS) {
            throw new Error("Import exceeds room limit");
        }
        if (counts.fixtures > MAX_IMPORT_FIXTURES) {
            throw new Error("Import exceeds fixture limit");
        }
        if (counts.bulbs > MAX_IMPORT_BULBS) {
            throw new Error("Import exceeds bulb limit");
        }
        if (counts.spareBulbs > MAX_IMPORT_SPARES) {
            throw new Error("Import exceeds spare bulb limit");
        }

        const now = Date.now();
        let importedProperties = 0;
        let importedRooms = 0;
        let importedFixtures = 0;
        let importedBulbs = 0;
        let importedSpares = 0;

        // ── Import properties → rooms → fixtures → bulbs ────────────

        if (Array.isArray(parsed.properties)) {
            for (const prop of parsed.properties) {
                if (!prop.name || typeof prop.name !== "string") {
                    throw new Error("Property missing required 'name' field");
                }

                const propertyId = await ctx.db.insert("properties", {
                    userId,
                    name: prop.name,
                    createdAt: now,
                    updatedAt: now,
                });
                importedProperties++;

                if (Array.isArray(prop.rooms)) {
                    for (const room of prop.rooms) {
                        if (!room.name || typeof room.name !== "string") {
                            throw new Error(
                                `Room missing required 'name' field in property "${prop.name}"`,
                            );
                        }
                        if (!VALID_ROOM_TYPES.has(room.roomType)) {
                            throw new Error(
                                `Invalid roomType "${room.roomType}" in room "${room.name}"`,
                            );
                        }

                        const roomId = await ctx.db.insert("rooms", {
                            propertyId,
                            name: room.name,
                            roomType: room.roomType,
                            createdAt: now,
                            updatedAt: now,
                        });
                        importedRooms++;

                        if (Array.isArray(room.fixtures)) {
                            for (const fixture of room.fixtures) {
                                if (
                                    !VALID_FIXTURE_LOCATIONS.has(
                                        fixture.location,
                                    )
                                ) {
                                    throw new Error(
                                        `Invalid fixture location "${fixture.location}" in room "${room.name}"`,
                                    );
                                }

                                const fixtureId = await ctx.db.insert(
                                    "fixtures",
                                    {
                                        roomId,
                                        name: fixture.name || undefined,
                                        location: fixture.location,
                                        notes: fixture.notes || undefined,
                                        createdAt: now,
                                        updatedAt: now,
                                    },
                                );
                                importedFixtures++;

                                if (Array.isArray(fixture.bulbs)) {
                                    for (const bulb of fixture.bulbs) {
                                        if (
                                            !VALID_SOCKET_TYPES.has(
                                                bulb.socketType,
                                            )
                                        ) {
                                            throw new Error(
                                                `Invalid socketType "${bulb.socketType}"`,
                                            );
                                        }
                                        if (
                                            !VALID_STATUSES.has(bulb.status)
                                        ) {
                                            throw new Error(
                                                `Invalid bulb status "${bulb.status}"`,
                                            );
                                        }
                                        if (
                                            !VALID_COLOUR_TEMPS.has(
                                                bulb.colourTemperature,
                                            )
                                        ) {
                                            throw new Error(
                                                `Invalid colourTemperature "${bulb.colourTemperature}"`,
                                            );
                                        }
                                        if (
                                            typeof bulb.wattage !== "number" ||
                                            bulb.wattage < 0
                                        ) {
                                            throw new Error(
                                                "Bulb wattage must be a non-negative number",
                                            );
                                        }

                                        await ctx.db.insert("bulbs", {
                                            fixtureId,
                                            socketType: bulb.socketType,
                                            features: Array.isArray(
                                                bulb.features,
                                            )
                                                ? bulb.features
                                                : [],
                                            installDate:
                                                typeof bulb.installDate ===
                                                "number"
                                                    ? bulb.installDate
                                                    : now,
                                            status: bulb.status,
                                            wattage: bulb.wattage,
                                            colourTemperature:
                                                bulb.colourTemperature,
                                            notes: bulb.notes || undefined,
                                            productName:
                                                bulb.productName || undefined,
                                            productUrl:
                                                normalizeOptionalHttpUrl(bulb.productUrl),
                                            createdAt: now,
                                            updatedAt: now,
                                        });
                                        importedBulbs++;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Import spare bulbs ──────────────────────────────────────

        if (Array.isArray(parsed.spareBulbs)) {
            for (const spare of parsed.spareBulbs) {
                if (!VALID_SOCKET_TYPES.has(spare.socketType)) {
                    throw new Error(
                        `Invalid spare bulb socketType "${spare.socketType}"`,
                    );
                }
                if (!VALID_COLOUR_TEMPS.has(spare.colourTemperature)) {
                    throw new Error(
                        `Invalid spare bulb colourTemperature "${spare.colourTemperature}"`,
                    );
                }
                if (typeof spare.wattage !== "number" || spare.wattage < 0) {
                    throw new Error(
                        "Spare bulb wattage must be a non-negative number",
                    );
                }
                if (
                    typeof spare.quantity !== "number" ||
                    spare.quantity < 0
                ) {
                    throw new Error(
                        "Spare bulb quantity must be a non-negative number",
                    );
                }

                await ctx.db.insert("spareBulbs", {
                    userId,
                    socketType: spare.socketType,
                    wattage: spare.wattage,
                    colourTemperature: spare.colourTemperature,
                    quantity: spare.quantity,
                    productName: spare.productName || undefined,
                    productUrl: normalizeOptionalHttpUrl(spare.productUrl),
                    notes: spare.notes || undefined,
                    createdAt: now,
                    updatedAt: now,
                });
                importedSpares++;
            }
        }

        return {
            importedProperties,
            importedRooms,
            importedFixtures,
            importedBulbs,
            importedSpares,
        };
    },
});
