import { v } from "convex/values";
import { parseImportData } from "../src/lib/import-data";
import { mutation, query } from "./_generated/server";
import { getVerifiedUserId, requireVerifiedUserId } from "./auth.helpers";
import { enforceRateLimit } from "./rateLimit";

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
        .withIndex("by_propertyId", (q) => q.eq("propertyId", property._id))
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
            .withIndex("by_fixtureId", (q) => q.eq("fixtureId", fixture._id))
            .collect();
          exportedFixtures.push({
            name: fixture.name,
            location: fixture.location,
            notes: fixture.notes,
            bulbs: bulbs.map(
              ({
                socketType,
                features,
                installDate,
                status,
                wattage,
                colourTemperature,
                notes,
                productName,
                productUrl,
              }) => ({
                socketType,
                features,
                installDate,
                status,
                wattage,
                colourTemperature,
                notes,
                productName,
                productUrl,
              }),
            ),
          });
        }
        exportedRooms.push({
          name: room.name,
          roomType: room.roomType,
          fixtures: exportedFixtures,
        });
      }
      exportedProperties.push({ name: property.name, rooms: exportedRooms });
    }
    const spareBulbs = await ctx.db
      .query("spareBulbs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      properties: exportedProperties,
      spareBulbs: spareBulbs.map(
        ({
          socketType,
          wattage,
          colourTemperature,
          quantity,
          productName,
          productUrl,
          notes,
        }) => ({
          socketType,
          wattage,
          colourTemperature,
          quantity,
          productName,
          productUrl,
          notes,
        }),
      ),
    };
  },
});

// ── Validation helpers ──────────────────────────────────────────────────

export { countImportEntities } from "../src/lib/import-data";

/**
 * Import inventory data from a JSON string (produced by exportAll).
 * The import is additive — existing data is not deleted or modified.
 * The entire operation is atomic: if any validation fails, nothing is written.
 */
export const importAll = mutation({
  args: { data: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireVerifiedUserId(ctx);
    await enforceRateLimit(ctx, {
      key: `importAll:${userId}`,
      limit: 5,
      windowMs: 3_600_000,
      errorMessage: "Too many imports. Please wait and try again later.",
    });
    const parsed = parseImportData(args.data);
    const now = Date.now();
    let importedProperties = 0;
    let importedRooms = 0;
    let importedFixtures = 0;
    let importedBulbs = 0;
    let importedSpares = 0;

    // ── Import properties → rooms → fixtures → bulbs ────────────

    for (const property of parsed.properties) {
      const propertyId = await ctx.db.insert("properties", {
        userId,
        name: property.name,
        createdAt: now,
        updatedAt: now,
      });
      importedProperties++;
      for (const room of property.rooms) {
        const roomId = await ctx.db.insert("rooms", {
          propertyId,
          name: room.name,
          roomType: room.roomType,
          createdAt: now,
          updatedAt: now,
        });
        importedRooms++;
        for (const fixture of room.fixtures) {
          const fixtureId = await ctx.db.insert("fixtures", {
            roomId,
            name: fixture.name,
            location: fixture.location,
            notes: fixture.notes,
            createdAt: now,
            updatedAt: now,
          });
          importedFixtures++;
          for (const bulb of fixture.bulbs) {
            await ctx.db.insert("bulbs", {
              ...bulb,
              fixtureId,
              createdAt: now,
              updatedAt: now,
            });
            importedBulbs++;
          }
        }
      }
    }

    // ── Import spare bulbs ──────────────────────────────────────

    for (const spare of parsed.spareBulbs) {
      await ctx.db.insert("spareBulbs", {
        ...spare,
        userId,
        createdAt: now,
        updatedAt: now,
      });
      importedSpares++;
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
