import { getVerifiedUserId } from "./auth.helpers";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByFixture = query({
    args: { fixtureId: v.id("fixtures") },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) return [];

    const fixture = await ctx.db.get(args.fixtureId);
    if (!fixture) return [];
    const room = await ctx.db.get(fixture.roomId);
    if (!room) return [];
    const property = await ctx.db.get(room.propertyId);
    if (!property || property.userId !== userId) return [];

        return await ctx.db
            .query("maintenanceLogs")
            .withIndex("by_fixtureId", (q) => q.eq("fixtureId", args.fixtureId))
            .order("desc")
      .collect()
      .then((logs) => logs.filter((log) => log.userId === userId));
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

        if (!args.fixtureId && !args.bulbId) {
          throw new Error("Either fixtureId or bulbId is required");
        }

        if (args.action.trim().length === 0 || args.action.length > 200) {
          throw new Error("Action must be between 1 and 200 characters");
        }
        if (args.notes && args.notes.length > 2000) {
          throw new Error("Notes must be 2000 characters or less");
        }

        let resolvedFixtureId = args.fixtureId;

        if (args.fixtureId) {
          const fixture = await ctx.db.get(args.fixtureId);
          if (!fixture) throw new Error("Fixture not found");
          const room = await ctx.db.get(fixture.roomId);
          if (!room) throw new Error("Room not found");
          const property = await ctx.db.get(room.propertyId);
          if (!property || property.userId !== userId) {
            throw new Error("Not authorized");
          }
        }

        if (args.bulbId) {
          const bulb = await ctx.db.get(args.bulbId);
          if (!bulb) throw new Error("Bulb not found");
          const fixture = await ctx.db.get(bulb.fixtureId);
          if (!fixture) throw new Error("Fixture not found");
          const room = await ctx.db.get(fixture.roomId);
          if (!room) throw new Error("Room not found");
          const property = await ctx.db.get(room.propertyId);
          if (!property || property.userId !== userId) {
            throw new Error("Not authorized");
          }

          if (resolvedFixtureId && resolvedFixtureId !== bulb.fixtureId) {
            throw new Error("Bulb does not belong to the provided fixture");
          }
          resolvedFixtureId = bulb.fixtureId;
        }

        return await ctx.db.insert("maintenanceLogs", {
            userId,
          fixtureId: resolvedFixtureId,
            bulbId: args.bulbId,
            action: args.action,
            notes: args.notes,
            date: args.date,
            createdAt: Date.now(),
        });
    },
});
