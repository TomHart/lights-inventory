import type { MutationCtx } from "./_generated/server";

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
  if (!key || key.length > 128) {
    throw new Error("Invalid rate limit key");
  }
  if (limit <= 0 || windowMs <= 0) {
    throw new Error("Invalid rate limit settings");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .collect();

  const active = existing.sort((a, b) => b.updatedAt - a.updatedAt)[0];

  for (const extra of existing.slice(1)) {
    await ctx.db.delete(extra._id);
  }

  if (!active) {
    await ctx.db.insert("rateLimits", {
      key,
      count: 1,
      windowStart: now,
      updatedAt: now,
    });
    return;
  }

  if (now - active.windowStart >= windowMs) {
    await ctx.db.patch(active._id, {
      count: 1,
      windowStart: now,
      updatedAt: now,
    });
    return;
  }

  if (active.count >= limit) {
    throw new Error(errorMessage ?? "Too many requests. Please try again later.");
  }

  await ctx.db.patch(active._id, {
    count: active.count + 1,
    updatedAt: now,
  });
}

