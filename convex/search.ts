import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";

export const searchAll = query({
    args: {
        socketType: v.optional(v.string()),
        minWattage: v.optional(v.number()),
        maxWattage: v.optional(v.number()),
        isSmart: v.optional(v.boolean()),
        status: v.optional(v.string()),
        colourTemperature: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return [];

        const properties = await ctx.db
            .query("properties")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect();

        const results: Array<{
            propertyName: string;
            propertyId: string;
            roomName: string;
            roomId: string;
            roomType: string;
            fixtureId: string;
            fixtureLocation: string;
            socketType: string;
            features: string[];
            bulbId: string;
            wattage: number;
            status: string;
            colourTemperature: string;
            installDate: number;
            productName?: string;
            notes?: string;
        }> = [];

        for (const property of properties) {
            const rooms = await ctx.db
                .query("rooms")
                .withIndex("by_propertyId", (q) => q.eq("propertyId", property._id))
                .collect();

            for (const room of rooms) {
                const fixtures = await ctx.db
                    .query("fixtures")
                    .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
                    .collect();

                for (const fixture of fixtures) {
                    // Apply fixture-level filters
                    if (args.socketType && fixture.socketType !== args.socketType)
                        continue;
                    if (
                        args.isSmart !== undefined &&
                        args.isSmart !== fixture.features.includes("smart")
                    )
                        continue;

                    const bulbs = await ctx.db
                        .query("bulbs")
                        .withIndex("by_fixtureId", (q) =>
                            q.eq("fixtureId", fixture._id),
                        )
                        .collect();

                    for (const bulb of bulbs) {
                        // Apply bulb-level filters
                        if (
                            args.minWattage !== undefined &&
                            bulb.wattage < args.minWattage
                        )
                            continue;
                        if (
                            args.maxWattage !== undefined &&
                            bulb.wattage > args.maxWattage
                        )
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
                            fixtureLocation: fixture.location,
                            socketType: fixture.socketType,
                            features: fixture.features,
                            bulbId: bulb._id,
                            wattage: bulb.wattage,
                            status: bulb.status,
                            colourTemperature: bulb.colourTemperature,
                            installDate: bulb.installDate,
                            productName: bulb.productName,
                            notes: bulb.notes,
                        });
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
        const userId = await getAuthUserId(ctx);
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
            };

        const properties = await ctx.db
            .query("properties")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect();

        let totalRooms = 0;
        let totalFixtures = 0;
        let totalBulbs = 0;
        let working = 0;
        let flickering = 0;
        let dead = 0;

        for (const property of properties) {
            const rooms = await ctx.db
                .query("rooms")
                .withIndex("by_propertyId", (q) => q.eq("propertyId", property._id))
                .collect();
            totalRooms += rooms.length;

            for (const room of rooms) {
                const fixtures = await ctx.db
                    .query("fixtures")
                    .withIndex("by_roomId", (q) => q.eq("roomId", room._id))
                    .collect();
                totalFixtures += fixtures.length;

                for (const fixture of fixtures) {
                    const bulbs = await ctx.db
                        .query("bulbs")
                        .withIndex("by_fixtureId", (q) =>
                            q.eq("fixtureId", fixture._id),
                        )
                        .collect();
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
        const reminders = await ctx.db
            .query("reminders")
            .withIndex("by_userId_active", (q) =>
                q.eq("userId", userId).eq("isActive", true),
            )
            .collect();
        const dueReminders = reminders.filter((r) => r.reminderDate <= now).length;

        const spares = await ctx.db
            .query("spareBulbs")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .collect();
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
        };
    },
});
