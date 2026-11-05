import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getVerifiedUserId } from "./auth.helpers";
import { colourTemperatures, socketTypes } from "./schema";
import {
  normalizeBulbFields,
  normalizeOptionalHttpUrl,
  requireCount,
} from "./validation";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("spareBulbs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const create = mutation({
  args: {
    socketType: socketTypes,
    wattage: v.number(),
    colourTemperature: colourTemperatures,
    quantity: v.number(),
    productName: v.optional(v.string()),
    productUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");
    args = normalizeBulbFields(args);
    const now = Date.now();
    return await ctx.db.insert("spareBulbs", {
      userId,
      socketType: args.socketType,
      wattage: args.wattage,
      colourTemperature: args.colourTemperature,
      quantity: args.quantity,
      productName: args.productName,
      productUrl: normalizeOptionalHttpUrl(args.productUrl),
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("spareBulbs"),
    socketType: v.optional(socketTypes),
    wattage: v.optional(v.number()),
    colourTemperature: v.optional(colourTemperatures),
    quantity: v.optional(v.number()),
    productName: v.optional(v.string()),
    productUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");
    const spare = await ctx.db.get(args.id);
    if (!spare || spare.userId !== userId) throw new ConvexError("Not found");

    const { id, ...updates } = normalizeBulbFields(args);
    const filteredUpdates: Record<string, unknown> = {};
    const normalizedProductUrl = normalizeOptionalHttpUrl(updates.productUrl);
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    for (const field of ["notes", "productName"] as const) {
      if (args[field] !== undefined) filteredUpdates[field] = updates[field];
    }
    if (updates.productUrl !== undefined) {
      filteredUpdates.productUrl = normalizedProductUrl;
    }
    filteredUpdates.updatedAt = Date.now();
    await ctx.db.patch(args.id, filteredUpdates);
  },
});

export const adjustQuantity = mutation({
  args: {
    id: v.id("spareBulbs"),
    delta: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");
    const spare = await ctx.db.get(args.id);
    if (!spare || spare.userId !== userId) throw new ConvexError("Not found");
    if (!Number.isSafeInteger(args.delta) || Math.abs(args.delta) > 10_000)
      throw new ConvexError(
        "Quantity adjustment must be an integer between -10000 and 10000",
      );
    const newQty = requireCount(
      Math.max(0, spare.quantity + args.delta),
      "Quantity",
    );
    await ctx.db.patch(args.id, {
      quantity: newQty,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("spareBulbs") },
  handler: async (ctx, args) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");
    const spare = await ctx.db.get(args.id);
    if (!spare || spare.userId !== userId) throw new ConvexError("Not found");
    await ctx.db.delete(args.id);
  },
});
