import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { colourTemperatures, socketTypes } from "./schema";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
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
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const now = Date.now();
    return await ctx.db.insert("spareBulbs", {
      userId,
      socketType: args.socketType,
      wattage: args.wattage,
      colourTemperature: args.colourTemperature,
      quantity: args.quantity,
      productName: args.productName,
      productUrl: args.productUrl,
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
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const spare = await ctx.db.get(args.id);
    if (!spare || spare.userId !== userId) throw new Error("Not found");

    const { id, ...updates } = args;
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
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
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const spare = await ctx.db.get(args.id);
    if (!spare || spare.userId !== userId) throw new Error("Not found");
    const newQty = Math.max(0, spare.quantity + args.delta);
    await ctx.db.patch(args.id, {
      quantity: newQty,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("spareBulbs") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const spare = await ctx.db.get(args.id);
    if (!spare || spare.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(args.id);
  },
});
