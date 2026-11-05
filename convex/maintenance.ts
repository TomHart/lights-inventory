import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getFixtureOwner,
  requireBulbOwner,
  requireFixtureOwner,
  requireVerifiedUserId,
} from "./auth.helpers";
import { optionalText, requireDate, requireText } from "./validation";

export const listByFixture = query({
  args: { fixtureId: v.id("fixtures") },
  handler: async (ctx, args) => {
    if (!(await getFixtureOwner(ctx, args.fixtureId))) return [];
    return ctx.db
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
    const userId = await requireVerifiedUserId(ctx);
    if (!args.fixtureId && !args.bulbId)
      throw new ConvexError("Either fixtureId or bulbId is required");
    let resolvedFixtureId = args.fixtureId;
    if (args.fixtureId) await requireFixtureOwner(ctx, args.fixtureId);
    if (args.bulbId) {
      const { bulb } = await requireBulbOwner(ctx, args.bulbId);
      if (resolvedFixtureId && resolvedFixtureId !== bulb.fixtureId)
        throw new ConvexError("Bulb does not belong to the provided fixture");
      resolvedFixtureId = bulb.fixtureId;
    }
    return ctx.db.insert("maintenanceLogs", {
      userId,
      fixtureId: resolvedFixtureId,
      bulbId: args.bulbId,
      action: requireText(args.action, "Action"),
      notes: optionalText(args.notes, "Notes"),
      date: requireDate(args.date),
      createdAt: Date.now(),
    });
  },
});
