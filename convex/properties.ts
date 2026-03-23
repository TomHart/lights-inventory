import { getVerifiedUserId } from "./auth.helpers";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) return [];
        return await ctx.db
            .query("properties")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect();
    },
});

export const get = query({
    args: { id: v.id("properties") },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) return null;
        const property = await ctx.db.get(args.id);
        if (!property || property.userId !== userId) return null;
        return property;
    },
});

export const getWithStats = query({
    args: { id: v.id("properties") },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) return null;
        const property = await ctx.db.get(args.id);
        if (!property || property.userId !== userId) return null;

        const rooms = await ctx.db
            .query("rooms")
            .withIndex("by_propertyId", (q) => q.eq("propertyId", args.id))
            .collect();

        let totalFixtures = 0;
        let totalBulbs = 0;
        let issueCount = 0;

        for (const room of rooms) {
            const fixtures = await ctx.db
                .query("fixtures")
                .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
                .collect();
            totalFixtures += fixtures.length;

            for (const fixture of fixtures) {
                const bulbs = await ctx.db
                    .query("bulbs")
                    .withIndex("by_fixtureId", (q) => q.eq("fixtureId", fixture._id))
                    .collect();
                totalBulbs += bulbs.length;
                issueCount += bulbs.filter(
                    (b) => b.status === "flickering" || b.status === "dead",
                ).length;
            }
        }

        return {
            ...property,
            roomCount: rooms.length,
            fixtureCount: totalFixtures,
            bulbCount: totalBulbs,
            issueCount,
        };
    },
});

export const create = mutation({
    args: { name: v.string() },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const now = Date.now();
        return await ctx.db.insert("properties", {
            userId,
            name: args.name,
            createdAt: now,
            updatedAt: now,
        });
    },
});

export const update = mutation({
    args: { id: v.id("properties"), name: v.string() },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const property = await ctx.db.get(args.id);
        if (!property || property.userId !== userId)
            throw new Error("Not found");
        await ctx.db.patch(args.id, { name: args.name, updatedAt: Date.now() });
    },
});

export const remove = mutation({
    args: { id: v.id("properties") },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const property = await ctx.db.get(args.id);
        if (!property || property.userId !== userId)
            throw new Error("Not found");

        // Cascade delete: rooms -> fixtures -> bulbs
        const rooms = await ctx.db
            .query("rooms")
            .withIndex("by_propertyId", (q) => q.eq("propertyId", args.id))
            .collect();

        for (const room of rooms) {
            const fixtures = await ctx.db
                .query("fixtures")
                .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
                .collect();

            for (const fixture of fixtures) {
                const bulbs = await ctx.db
                    .query("bulbs")
                    .withIndex("by_fixtureId", (q) => q.eq("fixtureId", fixture._id))
                    .collect();

                for (const bulb of bulbs) {
                    // Delete related reminders and maintenance logs
                    const reminders = await ctx.db
                        .query("reminders")
                        .withIndex("by_bulbId", (q) => q.eq("bulbId", bulb._id))
                        .collect();
                    for (const r of reminders) await ctx.db.delete(r._id);

                    const logs = await ctx.db
                        .query("maintenanceLogs")
                        .withIndex("by_bulbId", (q) => q.eq("bulbId", bulb._id))
                        .collect();
                    for (const l of logs) await ctx.db.delete(l._id);

                    await ctx.db.delete(bulb._id);
                }

                const fixtureLogs = await ctx.db
                    .query("maintenanceLogs")
                    .withIndex("by_fixtureId", (q) => q.eq("fixtureId", fixture._id))
                    .collect();
                for (const l of fixtureLogs) await ctx.db.delete(l._id);

                await ctx.db.delete(fixture._id);
            }
            await ctx.db.delete(room._id);
        }

        await ctx.db.delete(args.id);
    },
});
