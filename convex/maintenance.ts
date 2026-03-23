import { getVerifiedUserId } from "./auth.helpers";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByFixture = query({
    args: { fixtureId: v.id("fixtures") },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) return [];
        return await ctx.db
            .query("maintenanceLogs")
            .withIndex("by_fixtureId", (q) => q.eq("fixtureId", args.fixtureId))
            .order("desc")
            .collect();
    },
});

export const create = mutation({
    args: {
        fixtureId: v.optional(v.id("fixtures")),
        bulbId: v.optional(v.id("bulbs")),
        action: v.string(),
        notes: v.optional(v.string()),
        date: v.number(),
    },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        return await ctx.db.insert("maintenanceLogs", {
            userId,
            fixtureId: args.fixtureId,
            bulbId: args.bulbId,
            action: args.action,
            notes: args.notes,
            date: args.date,
            createdAt: Date.now(),
        });
    },
});
