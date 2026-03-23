import { getVerifiedUserId } from "./auth.helpers";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { fixtureLocations } from "./schema";

export const listByRoom = query({
    args: { roomId: v.id("rooms") },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) return [];
        const room = await ctx.db.get(args.roomId);
        if (!room) return [];
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId) return [];

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
        const userId = await getVerifiedUserId(ctx);
        if (!userId) return null;
        const fixture = await ctx.db.get(args.id);
        if (!fixture) return null;
        const room = await ctx.db.get(fixture.roomId);
        if (!room) return null;
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId) return null;
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
        location: fixtureLocations,
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const room = await ctx.db.get(args.roomId);
        if (!room) throw new Error("Not found");
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId)
            throw new Error("Not found");
        const now = Date.now();
        return await ctx.db.insert("fixtures", {
            roomId: args.roomId,
            location: args.location,
            notes: args.notes,
            createdAt: now,
            updatedAt: now,
        });
    },
});

export const update = mutation({
    args: {
        id: v.id("fixtures"),
        location: fixtureLocations,
        notes: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const fixture = await ctx.db.get(args.id);
        if (!fixture) throw new Error("Not found");
        const room = await ctx.db.get(fixture.roomId);
        if (!room) throw new Error("Not found");
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId)
            throw new Error("Not found");
        await ctx.db.patch(args.id, {
            location: args.location,
            notes: args.notes,
            updatedAt: Date.now(),
        });
    },
});

export const duplicate = mutation({
    args: { id: v.id("fixtures") },
    handler: async (ctx, args) => {
        const userId = await getVerifiedUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const fixture = await ctx.db.get(args.id);
        if (!fixture) throw new Error("Not found");
        const room = await ctx.db.get(fixture.roomId);
        if (!room) throw new Error("Not found");
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId)
            throw new Error("Not found");

        const now = Date.now();
        const newFixtureId = await ctx.db.insert("fixtures", {
            roomId: fixture.roomId,
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
        const userId = await getVerifiedUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const fixture = await ctx.db.get(args.id);
        if (!fixture) throw new Error("Not found");
        const room = await ctx.db.get(fixture.roomId);
        if (!room) throw new Error("Not found");
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId)
            throw new Error("Not found");

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
