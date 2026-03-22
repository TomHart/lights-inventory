import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { roomTypes } from "./schema";

export const listByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const property = await ctx.db.get(args.propertyId);
    if (!property || property.userId !== userId) return [];

    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    // Attach fixture/bulb counts to each room
    const roomsWithStats = await Promise.all(
      rooms.map(async (room) => {
        const fixtures = await ctx.db
          .query("fixtures")
          .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
          .collect();

        let bulbCount = 0;
        let issueCount = 0;
        for (const fixture of fixtures) {
          const bulbs = await ctx.db
            .query("bulbs")
            .withIndex("by_fixtureId", (q) => q.eq("fixtureId", fixture._id))
            .collect();
          bulbCount += bulbs.length;
          issueCount += bulbs.filter(
            (b) => b.status !== "working",
          ).length;
        }

        return {
          ...room,
          fixtureCount: fixtures.length,
          bulbCount,
          issueCount,
        };
      }),
    );

    return roomsWithStats;
  },
});

export const get = query({
  args: { id: v.id("rooms") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const room = await ctx.db.get(args.id);
    if (!room) return null;
    const property = await ctx.db.get(room.propertyId);
    if (!property || property.userId !== userId) return null;
    return { ...room, propertyName: property.name };
  },
});

export const create = mutation({
  args: {
    propertyId: v.id("properties"),
    name: v.string(),
    roomType: roomTypes,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const property = await ctx.db.get(args.propertyId);
    if (!property || property.userId !== userId)
      throw new Error("Not found");
    const now = Date.now();
    return await ctx.db.insert("rooms", {
      propertyId: args.propertyId,
      name: args.name,
      roomType: args.roomType,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("rooms"),
    name: v.string(),
    roomType: roomTypes,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const room = await ctx.db.get(args.id);
    if (!room) throw new Error("Not found");
    const property = await ctx.db.get(room.propertyId);
    if (!property || property.userId !== userId)
      throw new Error("Not found");
    await ctx.db.patch(args.id, {
      name: args.name,
      roomType: args.roomType,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("rooms") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const room = await ctx.db.get(args.id);
    if (!room) throw new Error("Not found");
    const property = await ctx.db.get(room.propertyId);
    if (!property || property.userId !== userId)
      throw new Error("Not found");

    // Cascade delete fixtures and bulbs
    const fixtures = await ctx.db
      .query("fixtures")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.id))
      .collect();

    for (const fixture of fixtures) {
      const bulbs = await ctx.db
        .query("bulbs")
        .withIndex("by_fixtureId", (q) => q.eq("fixtureId", fixture._id))
        .collect();

      for (const bulb of bulbs) {
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

    await ctx.db.delete(args.id);
  },
});
