import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const logs = await ctx.db
      .query("maintenanceLogs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);

    // Enrich with fixture/bulb info
    const enriched = await Promise.all(
      logs.map(async (log) => {
        let fixtureName = null;
        let roomName = null;

        if (log.fixtureId) {
          const fixture = await ctx.db.get(log.fixtureId);
          if (fixture) {
            fixtureName = `${fixture.location} (${fixture.socketType})`;
            const room = await ctx.db.get(fixture.roomId);
            if (room) roomName = room.name;
          }
        }

        return {
          ...log,
          fixtureName,
          roomName,
        };
      }),
    );

    return enriched;
  },
});

export const listByFixture = query({
  args: { fixtureId: v.id("fixtures") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("maintenanceLogs")
      .withIndex("by_fixtureId", (q) => q.eq("fixtureId", args.fixtureId))
      .order("desc")
      .collect();
  },
});

export const listByBulb = query({
  args: { bulbId: v.id("bulbs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("maintenanceLogs")
      .withIndex("by_bulbId", (q) => q.eq("bulbId", args.bulbId))
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
    const userId = await getAuthUserId(ctx);
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

export const remove = mutation({
  args: { id: v.id("maintenanceLogs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const log = await ctx.db.get(args.id);
    if (!log || log.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(args.id);
  },
});
