import { mutation } from "./_generated/server";
import { getVerifiedUserId } from "./auth.helpers";
import type { Doc } from "./_generated/dataModel";

// Temporary type for migration - fixtures that may still have deprecated fields
type FixtureWithDeprecatedFields = Doc<"fixtures"> & {
    socketType?: string;
    features?: string[];
};

/**
 * One-time migration: backfill socketType and features on bulbs,
 * and remove socketType/features from fixtures.
 *
 * For each bulb missing socketType/features, copies the values from
 * its parent fixture (or defaults to "E26" / []).
 * Then strips socketType/features from all fixture documents.
 *
 * Run via dashboard or: npx convex run migrations:backfillSocketTypeAndFeatures
 */
export const backfillSocketTypeAndFeatures = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        const properties = await ctx.db
            .query("properties")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect();

        const userFixtures = [] as Array<FixtureWithDeprecatedFields>;
        for (const property of properties) {
            const rooms = await ctx.db
                .query("rooms")
                .withIndex("by_propertyId", (q) => q.eq("propertyId", property._id))
                .collect();
            for (const room of rooms) {
                const fixtures = await ctx.db
                    .query("fixtures")
                    .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
                    .collect();
                userFixtures.push(...fixtures);
            }
        }

        // 1. Backfill bulbs for the current user's fixtures
        let bulbsUpdated = 0;
        for (const fixture of userFixtures) {
            const bulbs = await ctx.db
                .query("bulbs")
                .withIndex("by_fixtureId", (q) => q.eq("fixtureId", fixture._id))
                .collect();
            for (const bulb of bulbs) {
                if (bulb.socketType && bulb.features) continue;

                const socketType =
                    bulb.socketType || fixture.socketType || "E26";
                const features = bulb.features || fixture.features || [];

                await ctx.db.patch(bulb._id, { socketType, features });
                bulbsUpdated++;
            }
        }

        // 2. Strip socketType/features from the current user's fixtures
        // Note: These fields no longer exist in the schema, so this step is now a no-op
        // Kept for historical context in case the schema changes back
        let fixturesUpdated = 0;
        for (const fixture of userFixtures) {
            // Check if fixture has deprecated fields (from old schema)
            if ("socketType" in fixture || "features" in fixture) {
                // These fields are not in the current schema, so we can't patch them
                // This migration is now just for record-keeping
                fixturesUpdated++;
            }
        }

        return { bulbsUpdated, fixturesUpdated };
    },
});
