import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { bulbStatuses, colourTemperatures } from "./schema";

export const listByFixture = query({
    args: { fixtureId: v.id("fixtures") },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return [];
        const fixture = await ctx.db.get(args.fixtureId);
        if (!fixture) return [];
        const room = await ctx.db.get(fixture.roomId);
        if (!room) return [];
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId) return [];

        return await ctx.db
            .query("bulbs")
            .withIndex("by_fixtureId", (q) => q.eq("fixtureId", args.fixtureId))
            .collect();
    },
});

export const create = mutation({
    args: {
        fixtureId: v.id("fixtures"),
        installDate: v.number(),
        status: bulbStatuses,
        wattage: v.number(),
        colourTemperature: colourTemperatures,
        notes: v.optional(v.string()),
        productName: v.optional(v.string()),
        productUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const fixture = await ctx.db.get(args.fixtureId);
        if (!fixture) throw new Error("Not found");
        const room = await ctx.db.get(fixture.roomId);
        if (!room) throw new Error("Not found");
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId)
            throw new Error("Not found");
        const now = Date.now();
        return await ctx.db.insert("bulbs", {
            fixtureId: args.fixtureId,
            installDate: args.installDate,
            status: args.status,
            wattage: args.wattage,
            colourTemperature: args.colourTemperature,
            notes: args.notes,
            productName: args.productName,
            productUrl: args.productUrl,
            createdAt: now,
            updatedAt: now,
        });
    },
});

export const update = mutation({
    args: {
        id: v.id("bulbs"),
        installDate: v.optional(v.number()),
        status: v.optional(bulbStatuses),
        wattage: v.optional(v.number()),
        colourTemperature: v.optional(colourTemperatures),
        notes: v.optional(v.string()),
        productName: v.optional(v.string()),
        productUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const bulb = await ctx.db.get(args.id);
        if (!bulb) throw new Error("Not found");
        const fixture = await ctx.db.get(bulb.fixtureId);
        if (!fixture) throw new Error("Not found");
        const room = await ctx.db.get(fixture.roomId);
        if (!room) throw new Error("Not found");
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId)
            throw new Error("Not found");

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

export const updateStatus = mutation({
    args: {
        id: v.id("bulbs"),
        status: bulbStatuses,
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const bulb = await ctx.db.get(args.id);
        if (!bulb) throw new Error("Not found");
        const fixture = await ctx.db.get(bulb.fixtureId);
        if (!fixture) throw new Error("Not found");
        const room = await ctx.db.get(fixture.roomId);
        if (!room) throw new Error("Not found");
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId)
            throw new Error("Not found");

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

export const remove = mutation({
    args: { id: v.id("bulbs") },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const bulb = await ctx.db.get(args.id);
        if (!bulb) throw new Error("Not found");
        const fixture = await ctx.db.get(bulb.fixtureId);
        if (!fixture) throw new Error("Not found");
        const room = await ctx.db.get(fixture.roomId);
        if (!room) throw new Error("Not found");
        const property = await ctx.db.get(room.propertyId);
        if (!property || property.userId !== userId)
            throw new Error("Not found");

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
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        for (const id of args.ids) {
            const bulb = await ctx.db.get(id);
            if (!bulb) continue;
            const fixture = await ctx.db.get(bulb.fixtureId);
            if (!fixture) continue;
            const room = await ctx.db.get(fixture.roomId);
            if (!room) continue;
            const property = await ctx.db.get(room.propertyId);
            if (!property || property.userId !== userId) continue;

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
