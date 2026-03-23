import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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
