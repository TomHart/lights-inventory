import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getVerifiedUserId, requireBulbOwner } from "./auth.helpers";
import { requireDate, requireText } from "./validation";

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
          fixtureName: fixture?.name ?? null,
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
    if (!userId) throw new ConvexError("Not authenticated");
    const reminder = await ctx.db.get(args.id);
    if (!reminder || reminder.userId !== userId)
      throw new ConvexError("Not authorized");
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
    // Verify ownership
    const { userId } = await requireBulbOwner(ctx, args.bulbId);

    return await ctx.db.insert("reminders", {
      userId,
      bulbId: args.bulbId,
      reminderDate: requireDate(args.reminderDate),
      message: requireText(args.message, "Message", 500),
      isActive: true,
      createdAt: Date.now(),
    });
  },
});
