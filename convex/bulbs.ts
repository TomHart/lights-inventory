import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getBulbOwner,
  getFixtureOwner,
  getVerifiedUserId,
  requireBulbOwner,
  requireFixtureOwner,
} from "./auth.helpers";
import { bulbStatuses, colourTemperatures, socketTypes } from "./schema";
import { normalizeBulbFields, normalizeOptionalHttpUrl } from "./validation";

export const listByFixture = query({
  args: { fixtureId: v.id("fixtures") },
  handler: async (ctx, args) => {
    if (!(await getFixtureOwner(ctx, args.fixtureId))) return [];

    return await ctx.db
      .query("bulbs")
      .withIndex("by_fixtureId", (q) => q.eq("fixtureId", args.fixtureId))
      .collect();
  },
});

export const create = mutation({
  args: {
    fixtureId: v.id("fixtures"),
    socketType: socketTypes,
    features: v.array(v.string()),
    installDate: v.number(),
    status: bulbStatuses,
    wattage: v.number(),
    colourTemperature: colourTemperatures,
    notes: v.optional(v.string()),
    productName: v.optional(v.string()),
    productUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFixtureOwner(ctx, args.fixtureId);
    args = normalizeBulbFields(args);
    const now = Date.now();
    return await ctx.db.insert("bulbs", {
      fixtureId: args.fixtureId,
      socketType: args.socketType,
      features: args.features,
      installDate: args.installDate,
      status: args.status,
      wattage: args.wattage,
      colourTemperature: args.colourTemperature,
      notes: args.notes,
      productName: args.productName,
      productUrl: normalizeOptionalHttpUrl(args.productUrl),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("bulbs"),
    socketType: v.optional(socketTypes),
    features: v.optional(v.array(v.string())),
    installDate: v.optional(v.number()),
    status: v.optional(bulbStatuses),
    wattage: v.optional(v.number()),
    colourTemperature: v.optional(colourTemperatures),
    notes: v.optional(v.string()),
    productName: v.optional(v.string()),
    productUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBulbOwner(ctx, args.id);

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

export const updateStatus = mutation({
  args: {
    id: v.id("bulbs"),
    status: bulbStatuses,
  },
  handler: async (ctx, args) => {
    const { userId, fixture } = await requireBulbOwner(ctx, args.id);

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    // Auto-log maintenance entry
    await ctx.db.insert("maintenanceLogs", {
      userId,
      fixtureId: fixture._id,
      bulbId: args.id,
      action: `Status changed to ${args.status}`,
      date: Date.now(),
      createdAt: Date.now(),
    });
  },
});

export const duplicate = mutation({
  args: { id: v.id("bulbs") },
  handler: async (ctx, args) => {
    const { bulb } = await requireBulbOwner(ctx, args.id);

    const now = Date.now();
    return await ctx.db.insert("bulbs", {
      fixtureId: bulb.fixtureId,
      socketType: bulb.socketType,
      features: [...bulb.features],
      installDate: bulb.installDate,
      status: bulb.status,
      wattage: bulb.wattage,
      colourTemperature: bulb.colourTemperature,
      notes: bulb.notes,
      productName: bulb.productName,
      productUrl: normalizeOptionalHttpUrl(bulb.productUrl),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("bulbs") },
  handler: async (ctx, args) => {
    await requireBulbOwner(ctx, args.id);

    // Delete related reminders and maintenance logs
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_bulbId", (q) => q.eq("bulbId", args.id))
      .collect();
    for (const r of reminders) await ctx.db.delete(r._id);

    const logs = await ctx.db
      .query("maintenanceLogs")
      .withIndex("by_bulbId", (q) => q.eq("bulbId", args.id))
      .collect();
    for (const l of logs) await ctx.db.delete(l._id);

    await ctx.db.delete(args.id);
  },
});

export const bulkUpdateStatus = mutation({
  args: {
    ids: v.array(v.id("bulbs")),
    status: bulbStatuses,
  },
  handler: async (ctx, args) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    if (args.ids.length > 2000)
      throw new ConvexError("Select at most 2000 bulbs");
    for (const id of new Set(args.ids)) {
      const owner = await getBulbOwner(ctx, id);
      if (!owner) continue;
      const { fixture } = owner;

      await ctx.db.patch(id, { status: args.status, updatedAt: Date.now() });

      await ctx.db.insert("maintenanceLogs", {
        userId,
        fixtureId: fixture._id,
        bulbId: id,
        action: `Bulk status change to ${args.status}`,
        date: Date.now(),
        createdAt: Date.now(),
      });
    }
  },
});
