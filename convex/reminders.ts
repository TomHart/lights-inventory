import { getVerifiedUserId } from "./auth.helpers";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listDue = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId) return [];
    const now = Date.now();
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_userId_active", (q) =>
        q.eq("userId", userId).eq("isActive", true),
      )
      .collect();

    const due = reminders.filter((r) => r.reminderDate <= now);

    return Promise.all(
      due.map(async (r) => {
        const bulb = await ctx.db.get(r.bulbId);
        const fixture = bulb ? await ctx.db.get(bulb.fixtureId) : null;
        const room = fixture ? await ctx.db.get(fixture.roomId) : null;
        return {
          ...r,
          fixtureId: bulb?.fixtureId ?? null,
          fixtureLocation: fixture?.location ?? null,
          roomName: room?.name ?? null,
          bulbWattage: bulb?.wattage ?? null,
          bulbProductName: bulb?.productName ?? null,
        };
      }),
    );
  },
});

export const dismiss = mutation({
  args: { id: v.id("reminders") },
  handler: async (ctx, args) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const reminder = await ctx.db.get(args.id);
    if (!reminder || reminder.userId !== userId)
      throw new Error("Not authorized");
    await ctx.db.patch(args.id, { isActive: false });
  },
});

export const create = mutation({
  args: {
    bulbId: v.id("bulbs"),
    reminderDate: v.number(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getVerifiedUserId(ctx);
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
