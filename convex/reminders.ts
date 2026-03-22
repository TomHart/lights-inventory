import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("reminders")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_userId_active", (q) =>
        q.eq("userId", userId).eq("isActive", true),
      )
      .collect();

    // Enrich with bulb/fixture info
    const enriched = await Promise.all(
      reminders.map(async (reminder) => {
        const bulb = await ctx.db.get(reminder.bulbId);
        if (!bulb) return { ...reminder, bulbInfo: null };
        const fixture = await ctx.db.get(bulb.fixtureId);
        if (!fixture) return { ...reminder, bulbInfo: null };
        const room = await ctx.db.get(fixture.roomId);
        return {
          ...reminder,
          bulbInfo: {
            wattage: bulb.wattage,
            status: bulb.status,
            fixtureName: `${fixture.location} (${fixture.socketType})`,
            roomName: room?.name ?? "Unknown",
          },
        };
      }),
    );

    return enriched;
  },
});

export const listDue = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const now = Date.now();
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_userId_active", (q) =>
        q.eq("userId", userId).eq("isActive", true),
      )
      .collect();

    return reminders.filter((r) => r.reminderDate <= now);
  },
});

export const create = mutation({
  args: {
    bulbId: v.id("bulbs"),
    reminderDate: v.number(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Verify ownership
    const bulb = await ctx.db.get(args.bulbId);
    if (!bulb) throw new Error("Bulb not found");
    const fixture = await ctx.db.get(bulb.fixtureId);
    if (!fixture) throw new Error("Fixture not found");
    const room = await ctx.db.get(fixture.roomId);
    if (!room) throw new Error("Room not found");
    const property = await ctx.db.get(room.propertyId);
    if (!property || property.userId !== userId)
      throw new Error("Not authorized");

    return await ctx.db.insert("reminders", {
      userId,
      bulbId: args.bulbId,
      reminderDate: args.reminderDate,
      message: args.message,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const dismiss = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const reminder = await ctx.db.get(args.id);
    if (!reminder || reminder.userId !== userId)
      throw new Error("Not found");
    await ctx.db.patch(args.id, { isActive: false });
  },
});

export const remove = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const reminder = await ctx.db.get(args.id);
    if (!reminder || reminder.userId !== userId)
      throw new Error("Not found");
    await ctx.db.delete(args.id);
  },
});
