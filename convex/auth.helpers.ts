import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function requireVerifiedUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getVerifiedUserId(ctx);
  if (!userId) throw new ConvexError("Not authenticated");
  return userId;
}

export async function getPropertyOwner(
  ctx: QueryCtx | MutationCtx,
  id: Id<"properties">,
) {
  const userId = await getVerifiedUserId(ctx);
  if (!userId) return null;
  const property = await ctx.db.get(id);
  return property?.userId === userId ? { userId, property } : null;
}

export async function getRoomOwner(
  ctx: QueryCtx | MutationCtx,
  id: Id<"rooms">,
) {
  const room = await ctx.db.get(id);
  if (!room) return null;
  const owner = await getPropertyOwner(ctx, room.propertyId);
  return owner ? { ...owner, room } : null;
}

export async function getFixtureOwner(
  ctx: QueryCtx | MutationCtx,
  id: Id<"fixtures">,
) {
  const fixture = await ctx.db.get(id);
  if (!fixture) return null;
  const owner = await getRoomOwner(ctx, fixture.roomId);
  return owner ? { ...owner, fixture } : null;
}

export async function getBulbOwner(
  ctx: QueryCtx | MutationCtx,
  id: Id<"bulbs">,
) {
  const bulb = await ctx.db.get(id);
  if (!bulb) return null;
  const owner = await getFixtureOwner(ctx, bulb.fixtureId);
  return owner ? { ...owner, bulb } : null;
}

async function requireOwner<T>(
  ctx: QueryCtx | MutationCtx,
  lookup: () => Promise<T | null>,
): Promise<T> {
  await requireVerifiedUserId(ctx);
  const owner = await lookup();
  if (!owner) throw new ConvexError("Not found");
  return owner;
}

export const requirePropertyOwner = (
  ctx: QueryCtx | MutationCtx,
  id: Id<"properties">,
) => requireOwner(ctx, () => getPropertyOwner(ctx, id));
export const requireRoomOwner = (
  ctx: QueryCtx | MutationCtx,
  id: Id<"rooms">,
) => requireOwner(ctx, () => getRoomOwner(ctx, id));
export const requireFixtureOwner = (
  ctx: QueryCtx | MutationCtx,
  id: Id<"fixtures">,
) => requireOwner(ctx, () => getFixtureOwner(ctx, id));
export const requireBulbOwner = (
  ctx: QueryCtx | MutationCtx,
  id: Id<"bulbs">,
) => requireOwner(ctx, () => getBulbOwner(ctx, id));

/**
 * Returns the user ID only if the user is authenticated AND has a verified
 * email address. Returns null otherwise.
 *
 * The Password provider's `verify` option already prevents unverified users
 * from obtaining sessions, so this is a defense-in-depth check that also
 * catches edge cases (e.g. sessions created before verification was enabled).
 */
export async function getVerifiedUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const user = await ctx.db.get(userId);
  if (!user?.emailVerificationTime) return null;

  return userId;
}
