import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getVerifiedUserId } from "./auth.helpers";
import { requireCount, requireWattage } from "./validation";

const MAX_SCAN = 20_000;

export async function scan<T>(
  query: { take(n: number): Promise<T[]> },
  budget: { remaining: number },
) {
  if (!budget.remaining) return [];
  const documents = await query.take(budget.remaining);
  budget.remaining -= documents.length;
  return documents;
}

export const searchAll = query({
  args: {
    socketType: v.optional(v.string()),
    minWattage: v.optional(v.number()),
    maxWattage: v.optional(v.number()),
    isSmart: v.optional(v.boolean()),
    status: v.optional(v.string()),
    colourTemperature: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId) return [];
    const limit = Math.max(
      1,
      requireCount(args.limit ?? 500, "Result limit", 2000),
    );
    if (args.minWattage !== undefined) requireWattage(args.minWattage);
    if (args.maxWattage !== undefined) requireWattage(args.maxWattage);

    const budget = { remaining: MAX_SCAN };
    const properties = await scan(
      ctx.db
        .query("properties")
        .withIndex("by_userId", (q) => q.eq("userId", userId)),
      budget,
    );

    const results: Array<{
      propertyName: string;
      propertyId: Id<"properties">;
      roomName: string;
      roomId: Id<"rooms">;
      roomType: Doc<"rooms">["roomType"];
      fixtureId: Id<"fixtures">;
      fixtureName?: string;
      fixtureLocation: Doc<"fixtures">["location"];
      socketType: Doc<"bulbs">["socketType"];
      features: string[];
      bulbId: Id<"bulbs">;
      wattage: number;
      status: Doc<"bulbs">["status"];
      colourTemperature: Doc<"bulbs">["colourTemperature"];
      installDate: number;
      productName?: string;
      notes?: string;
    }> = [];

    for (const property of properties) {
      const rooms = await scan(
        ctx.db
          .query("rooms")
          .withIndex("by_propertyId", (q) => q.eq("propertyId", property._id)),
        budget,
      );

      for (const room of rooms) {
        const fixtures = await scan(
          ctx.db
            .query("fixtures")
            .withIndex("by_roomId", (q) => q.eq("roomId", room._id)),
          budget,
        );

        for (const fixture of fixtures) {
          const bulbs = await scan(
            ctx.db
              .query("bulbs")
              .withIndex("by_fixtureId", (q) => q.eq("fixtureId", fixture._id)),
            budget,
          );

          for (const bulb of bulbs) {
            // Apply bulb-level filters
            if (args.socketType && bulb.socketType !== args.socketType)
              continue;
            if (
              args.isSmart !== undefined &&
              args.isSmart !== bulb.features.includes("smart")
            )
              continue;
            if (args.minWattage !== undefined && bulb.wattage < args.minWattage)
              continue;
            if (args.maxWattage !== undefined && bulb.wattage > args.maxWattage)
              continue;
            if (args.status && bulb.status !== args.status) continue;
            if (
              args.colourTemperature &&
              bulb.colourTemperature !== args.colourTemperature
            )
              continue;

            results.push({
              propertyName: property.name,
              propertyId: property._id,
              roomName: room.name,
              roomId: room._id,
              roomType: room.roomType,
              fixtureId: fixture._id,
              fixtureName: fixture.name,
              fixtureLocation: fixture.location,
              socketType: bulb.socketType,
              features: bulb.features,
              bulbId: bulb._id,
              wattage: bulb.wattage,
              status: bulb.status,
              colourTemperature: bulb.colourTemperature,
              installDate: bulb.installDate,
              productName: bulb.productName,
              notes: bulb.notes,
            });

            if (results.length >= limit) {
              return results;
            }
          }
        }
      }
    }

    return results;
  },
});

export const dashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getVerifiedUserId(ctx);
    if (!userId)
      return {
        properties: 0,
        rooms: 0,
        fixtures: 0,
        bulbs: 0,
        working: 0,
        flickering: 0,
        dead: 0,
        dueReminders: 0,
        spareCount: 0,
        truncated: false,
      };

    const budget = { remaining: MAX_SCAN };
    const properties = await scan(
      ctx.db
        .query("properties")
        .withIndex("by_userId", (q) => q.eq("userId", userId)),
      budget,
    );

    let totalRooms = 0;
    let totalFixtures = 0;
    let totalBulbs = 0;
    let working = 0;
    let flickering = 0;
    let dead = 0;

    for (const property of properties) {
      const rooms = await scan(
        ctx.db
          .query("rooms")
          .withIndex("by_propertyId", (q) => q.eq("propertyId", property._id)),
        budget,
      );
      totalRooms += rooms.length;

      for (const room of rooms) {
        const fixtures = await scan(
          ctx.db
            .query("fixtures")
            .withIndex("by_roomId", (q) => q.eq("roomId", room._id)),
          budget,
        );
        totalFixtures += fixtures.length;

        for (const fixture of fixtures) {
          const bulbs = await scan(
            ctx.db
              .query("bulbs")
              .withIndex("by_fixtureId", (q) => q.eq("fixtureId", fixture._id)),
            budget,
          );
          totalBulbs += bulbs.length;
          for (const b of bulbs) {
            if (b.status === "working") working++;
            else if (b.status === "flickering") flickering++;
            else if (b.status === "dead") dead++;
          }
        }
      }
    }

    const now = Date.now();
    const reminders = await scan(
      ctx.db
        .query("reminders")
        .withIndex("by_userId_active", (q) =>
          q.eq("userId", userId).eq("isActive", true),
        ),
      budget,
    );
    const dueReminders = reminders.filter((r) => r.reminderDate <= now).length;

    const spares = await scan(
      ctx.db
        .query("spareBulbs")
        .withIndex("by_userId", (q) => q.eq("userId", userId)),
      budget,
    );
    const spareCount = spares.reduce((sum, s) => sum + s.quantity, 0);

    return {
      properties: properties.length,
      rooms: totalRooms,
      fixtures: totalFixtures,
      bulbs: totalBulbs,
      working,
      flickering,
      dead,
      dueReminders,
      spareCount,
      truncated: budget.remaining === 0,
    };
  },
});
