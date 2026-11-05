import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getFixtureOwner,
  getRoomOwner,
  requireFixtureOwner,
  requireRoomOwner,
} from "./auth.helpers";
import { fixtureLocations } from "./schema";
import { optionalText } from "./validation";

export const listByRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    if (!(await getRoomOwner(ctx, args.roomId))) return [];

    const fixtures = await ctx.db
      .query("fixtures")
      .withIndex("by_roomId", (q) => q.eq("roomId", args.roomId))
      .collect();

    const fixturesWithStats = await Promise.all(
      fixtures.map(async (fixture) => {
        const bulbs = await ctx.db
          .query("bulbs")
          .withIndex("by_fixtureId", (q) => q.eq("fixtureId", fixture._id))
          .collect();
        return {
          ...fixture,
          bulbCount: bulbs.length,
          issueCount: bulbs.filter((b) => b.status !== "working").length,
        };
      }),
    );

    return fixturesWithStats;
  },
});

export const get = query({
  args: { id: v.id("fixtures") },
  handler: async (ctx, args) => {
    const owner = await getFixtureOwner(ctx, args.id);
    if (!owner) return null;
    const { fixture, room, property } = owner;
    return {
      ...fixture,
      roomName: room.name,
      roomType: room.roomType,
      propertyId: property._id,
      propertyName: property.name,
    };
  },
});

export const create = mutation({
  args: {
    roomId: v.id("rooms"),
    name: v.optional(v.string()),
    location: fixtureLocations,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRoomOwner(ctx, args.roomId);
    const now = Date.now();
    return await ctx.db.insert("fixtures", {
      roomId: args.roomId,
      name: optionalText(args.name, "Fixture name", 200),
      location: args.location,
      notes: optionalText(args.notes, "Notes"),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("fixtures"),
    name: v.optional(v.string()),
    location: fixtureLocations,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFixtureOwner(ctx, args.id);
    await ctx.db.patch(args.id, {
      name: optionalText(args.name, "Fixture name", 200),
      location: args.location,
      notes: optionalText(args.notes, "Notes"),
      updatedAt: Date.now(),
    });
  },
});

export const duplicate = mutation({
  args: { id: v.id("fixtures") },
  handler: async (ctx, args) => {
    const { fixture } = await requireFixtureOwner(ctx, args.id);

    const now = Date.now();
    const newFixtureId = await ctx.db.insert("fixtures", {
      roomId: fixture.roomId,
      name: fixture.name ? `${fixture.name} (Copy)` : undefined,
      location: fixture.location,
      notes: fixture.notes ? `(Copy) ${fixture.notes}` : "(Copy)",
      createdAt: now,
      updatedAt: now,
    });

    // Also duplicate all bulbs
    const bulbs = await ctx.db
      .query("bulbs")
      .withIndex("by_fixtureId", (q) => q.eq("fixtureId", args.id))
      .collect();

    for (const bulb of bulbs) {
      await ctx.db.insert("bulbs", {
        fixtureId: newFixtureId,
        socketType: bulb.socketType,
        features: [...bulb.features],
        installDate: bulb.installDate,
        status: bulb.status,
        wattage: bulb.wattage,
        colourTemperature: bulb.colourTemperature,
        notes: bulb.notes,
        productName: bulb.productName,
        productUrl: bulb.productUrl,
        createdAt: now,
        updatedAt: now,
      });
    }

    return newFixtureId;
  },
});

export const remove = mutation({
  args: { id: v.id("fixtures") },
  handler: async (ctx, args) => {
    await requireFixtureOwner(ctx, args.id);

    const bulbs = await ctx.db
      .query("bulbs")
      .withIndex("by_fixtureId", (q) => q.eq("fixtureId", args.id))
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
      .withIndex("by_fixtureId", (q) => q.eq("fixtureId", args.id))
      .collect();
    for (const l of fixtureLogs) await ctx.db.delete(l._id);

    await ctx.db.delete(args.id);
  },
});
