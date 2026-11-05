import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { scan } from "./search";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "owner@example.com",
      emailVerificationTime: Date.now(),
    });
    const otherId = await ctx.db.insert("users", {
      email: "other@example.com",
      emailVerificationTime: Date.now(),
    });
    const unverifiedId = await ctx.db.insert("users", {
      email: "unverified@example.com",
    });
    return { userId, otherId, unverifiedId };
  });
  const owner = t.withIdentity({ subject: ids.userId });
  const propertyId = await owner.mutation(api.properties.create, {
    name: " House ",
  });
  const roomId = await owner.mutation(api.rooms.create, {
    propertyId,
    name: " Room ",
    roomType: "bedroom",
  });
  const fixtureId = await owner.mutation(api.fixtures.create, {
    roomId,
    location: "ceiling",
  });
  const bulbId = await owner.mutation(api.bulbs.create, {
    fixtureId,
    socketType: "E26",
    features: [],
    installDate: Date.now(),
    status: "working",
    wattage: 6,
    colourTemperature: "warm",
  });
  return {
    t,
    owner,
    other: t.withIdentity({ subject: ids.otherId }),
    ids,
    propertyId,
    roomId,
    fixtureId,
    bulbId,
  };
}

describe("ownership and CRUD", () => {
  it("trims names and hides other users' data", async () => {
    const { owner, other, propertyId, fixtureId } = await setup();
    expect(
      (await owner.query(api.properties.get, { id: propertyId }))?.name,
    ).toBe("House");
    expect(
      await other.query(api.properties.get, { id: propertyId }),
    ).toBeNull();
    expect(await other.query(api.bulbs.listByFixture, { fixtureId })).toEqual(
      [],
    );
  });
  it("rejects writes from anonymous, unverified, and other users", async () => {
    const { t, ids, other, bulbId } = await setup();
    for (const client of [
      t,
      t.withIdentity({ subject: ids.unverifiedId }),
      other,
    ]) {
      await expect(
        client.mutation(api.bulbs.update, { id: bulbId, wattage: 10 }),
      ).rejects.toThrow();
    }
  });
  it("rejects invalid names, wattage, quantities and dates", async () => {
    const { owner, fixtureId, bulbId } = await setup();
    await expect(
      owner.mutation(api.properties.create, { name: "   " }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.bulbs.update, { id: bulbId, wattage: NaN }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.bulbs.create, {
        fixtureId,
        socketType: "E26",
        features: [],
        installDate: Date.now(),
        status: "working",
        wattage: -5,
        colourTemperature: "warm",
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.inventory.create, {
        socketType: "E26",
        wattage: 6,
        colourTemperature: "warm",
        quantity: -1,
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.reminders.create, {
        bulbId,
        reminderDate: Infinity,
        message: "Check",
      }),
    ).rejects.toThrow();
  });
  it("updates status and creates maintenance history", async () => {
    const { owner, bulbId, fixtureId } = await setup();
    await owner.mutation(api.bulbs.updateStatus, {
      id: bulbId,
      status: "dead",
    });
    expect(
      (await owner.query(api.bulbs.listByFixture, { fixtureId }))[0].status,
    ).toBe("dead");
    expect(
      await owner.query(api.maintenance.listByFixture, { fixtureId }),
    ).toHaveLength(1);
  });
  it("skips foreign IDs in bulk updates", async () => {
    const { t, other, owner, bulbId, fixtureId } = await setup();
    const ownProperty = await other.mutation(api.properties.create, {
      name: "Other",
    });
    const ownRoom = await other.mutation(api.rooms.create, {
      propertyId: ownProperty,
      name: "Other",
      roomType: "other",
    });
    const ownFixture = await other.mutation(api.fixtures.create, {
      roomId: ownRoom,
      location: "wall",
    });
    const ownBulb = await other.mutation(api.bulbs.create, {
      fixtureId: ownFixture,
      socketType: "E26",
      features: [],
      installDate: Date.now(),
      status: "working",
      wattage: 5,
      colourTemperature: "warm",
    });
    await other.mutation(api.bulbs.bulkUpdateStatus, {
      ids: [bulbId, ownBulb],
      status: "dead",
    });
    expect(
      (await owner.query(api.bulbs.listByFixture, { fixtureId }))[0].status,
    ).toBe("working");
    expect((await t.run((ctx) => ctx.db.get(ownBulb)))?.status).toBe("dead");
  });
  it("cascades property deletion into bulbs, reminders, and logs", async () => {
    const { t, owner, propertyId, bulbId, fixtureId } = await setup();
    await owner.mutation(api.reminders.create, {
      bulbId,
      reminderDate: Date.now(),
      message: "Check",
    });
    await owner.mutation(api.maintenance.create, {
      fixtureId,
      bulbId,
      action: "Check",
      date: Date.now(),
    });
    await owner.mutation(api.properties.remove, { id: propertyId });
    for (const table of [
      "properties",
      "rooms",
      "fixtures",
      "bulbs",
      "reminders",
      "maintenanceLogs",
    ] as const) {
      expect(await t.run((ctx) => ctx.db.query(table).collect())).toEqual([]);
    }
  });
  it("round-trips export/import and rejects malformed imports atomically", async () => {
    const { owner } = await setup();
    const exported = await owner.query(api.dataTransfer.exportAll);
    expect(
      (
        await owner.mutation(api.dataTransfer.importAll, {
          data: JSON.stringify(exported),
        })
      ).importedBulbs,
    ).toBe(1);
    const before = await owner.query(api.properties.list);
    await expect(
      owner.mutation(api.dataTransfer.importAll, {
        data: JSON.stringify({
          version: 1,
          properties: [{ name: "Valid" }, { name: "   " }],
        }),
      }),
    ).rejects.toThrow();
    expect(await owner.query(api.properties.list)).toEqual(before);
  });
});

describe("optional-field updates and search", () => {
  it("bounds reads and stops issuing queries when the shared budget is exhausted", async () => {
    const budget = { remaining: 3 };
    const take = vi.fn(async (limit: number) => [1, 2, 3, 4].slice(0, limit));
    expect(await scan({ take }, budget)).toEqual([1, 2, 3]);
    expect(budget.remaining).toBe(0);
    expect(await scan({ take }, budget)).toEqual([]);
    expect(take).toHaveBeenCalledTimes(1);
  });
  it("clears optional text and URLs while preserving omitted fields", async () => {
    const { t, owner, bulbId } = await setup();
    await owner.mutation(api.bulbs.update, {
      id: bulbId,
      notes: " Note ",
      productName: "Brand",
      productUrl: "https://example.com",
    });
    await owner.mutation(api.bulbs.update, {
      id: bulbId,
      notes: "  ",
      productName: "",
      productUrl: "",
    });
    const bulb = await t.run((ctx) => ctx.db.get(bulbId));
    expect(bulb?.notes).toBeUndefined();
    expect(bulb?.productName).toBeUndefined();
    expect(bulb?.productUrl).toBeUndefined();
    expect(bulb?.wattage).toBe(6);
    const spareId = await owner.mutation(api.inventory.create, {
      socketType: "E26",
      wattage: 6,
      colourTemperature: "warm",
      quantity: 2,
      notes: "Note",
      productName: "Brand",
    });
    await owner.mutation(api.inventory.update, {
      id: spareId,
      notes: "",
      productName: "",
    });
    const spare = await t.run((ctx) => ctx.db.get(spareId));
    expect(spare?.notes).toBeUndefined();
    expect(spare?.productName).toBeUndefined();
    expect(spare?.quantity).toBe(2);
  });
  it("keeps dashboard and filtered search isolated to the owner", async () => {
    const { owner, other, bulbId } = await setup();
    expect(await owner.query(api.search.dashboardStats)).toMatchObject({
      properties: 1,
      rooms: 1,
      fixtures: 1,
      bulbs: 1,
      working: 1,
      truncated: false,
    });
    expect(await other.query(api.search.searchAll, {})).toEqual([]);
    expect(await owner.query(api.search.searchAll, { status: "dead" })).toEqual(
      [],
    );
    expect(
      (
        await owner.query(api.search.searchAll, {
          status: "working",
          minWattage: 5,
          maxWattage: 7,
        })
      )[0].bulbId,
    ).toBe(bulbId);
  });
  it("rejects the sixth successful import within an hour", async () => {
    const { owner } = await setup();
    const args = { data: JSON.stringify({ version: 1 }) };
    for (let i = 0; i < 5; i++)
      await owner.mutation(api.dataTransfer.importAll, args);
    await expect(
      owner.mutation(api.dataTransfer.importAll, args),
    ).rejects.toThrow();
  });
});

describe("durable rate limits", () => {
  it("limits a subject without locking out other subjects", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 5; i++)
      await t.mutation(internal.rateLimit.authAttempt, {
        subject: "alice",
        emailVerification: true,
      });
    await expect(
      t.mutation(internal.rateLimit.authAttempt, {
        subject: "alice",
        emailVerification: true,
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.rateLimit.authAttempt, {
        subject: "bob",
        emailVerification: true,
      }),
    ).resolves.toBeNull();
  });
  it("resets expired windows and removes only stale records", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimits", {
        key: "auth:email:alice",
        count: 5,
        windowStart: Date.now() - 3_600_001,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("rateLimits", {
        key: "stale",
        count: 1,
        windowStart: 0,
        updatedAt: Date.now() - 86_400_001,
      });
    });
    await t.mutation(internal.rateLimit.authAttempt, {
      subject: "alice",
      emailVerification: true,
    });
    expect(await t.mutation(internal.rateLimit.purgeStale)).toBe(1);
    expect(
      (await t.run((ctx) => ctx.db.query("rateLimits").collect()))[0].count,
    ).toBe(1);
  });
});
