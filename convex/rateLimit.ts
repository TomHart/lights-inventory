import { ConvexError, v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";

export async function enforceRateLimit(
  ctx: MutationCtx,
  {
    key,
    limit,
    windowMs,
    errorMessage,
  }: {
    key: string;
    limit: number;
    windowMs: number;
    errorMessage?: string;
  },
): Promise<void> {
  if (!key || key.length > 128) throw new Error("Invalid rate limit key");
  if (limit <= 0 || windowMs <= 0)
    throw new Error("Invalid rate limit settings");
  const now = Date.now();
  const active = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!active) {
    await ctx.db.insert("rateLimits", {
      key,
      count: 1,
      windowStart: now,
      updatedAt: now,
    });
  } else if (now - active.windowStart >= windowMs) {
    await ctx.db.patch(active._id, {
      count: 1,
      windowStart: now,
      updatedAt: now,
    });
  } else if (active.count >= limit) {
    throw new ConvexError({
      code: "RATE_LIMITED",
      message: errorMessage ?? "Too many requests. Please try again later.",
    });
  } else {
    await ctx.db.patch(active._id, { count: active.count + 1, updatedAt: now });
  }
}

export const authAttempt = internalMutation({
  args: { subject: v.string(), emailVerification: v.boolean() },
  handler: async (ctx, { subject, emailVerification }) => {
    await enforceRateLimit(ctx, {
      key: `auth:${emailVerification ? "email" : "attempt"}:${subject}`,
      limit: emailVerification ? 5 : 20,
      windowMs: emailVerification ? 3_600_000 : 600_000,
      errorMessage:
        "Too many authentication attempts. Please wait and try again later.",
    });
  },
});

export const purgeStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("rateLimits")
      .withIndex("by_updatedAt", (q) =>
        q.lt("updatedAt", Date.now() - 86_400_000),
      )
      .take(1000);
    await Promise.all(stale.map((row) => ctx.db.delete(row._id)));
    return stale.length;
  },
});
