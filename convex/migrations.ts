import { mutation } from "./_generated/server";

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
        // 1. Backfill bulbs
        const bulbs = await ctx.db.query("bulbs").collect();
        let bulbsUpdated = 0;
        for (const bulb of bulbs) {
            if (bulb.socketType && bulb.features) continue;

            // Try to copy from parent fixture
            const fixture = await ctx.db.get(bulb.fixtureId);
            const socketType = bulb.socketType || (fixture as any)?.socketType || "E26";
            const features = bulb.features || (fixture as any)?.features || [];

            await ctx.db.patch(bulb._id, { socketType, features });
            bulbsUpdated++;
        }

        // 2. Strip socketType/features from fixtures
        const fixtures = await ctx.db.query("fixtures").collect();
        let fixturesUpdated = 0;
        for (const fixture of fixtures) {
            if ((fixture as any).socketType !== undefined || (fixture as any).features !== undefined) {
                await ctx.db.patch(fixture._id, {
                    socketType: undefined,
                    features: undefined,
                } as any);
                fixturesUpdated++;
            }
        }

        return { bulbsUpdated, fixturesUpdated };
    },
});
