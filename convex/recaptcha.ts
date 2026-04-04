import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { enforceRateLimit } from "./rateLimit";

const RECAPTCHA_WINDOW_MS = 10 * 60 * 1000;
const RECAPTCHA_MAX_ATTEMPTS = 20;

export const assertRateLimit = internalMutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, { key }) => {
    await enforceRateLimit(ctx, {
      key: `recaptcha:${key}`,
      limit: RECAPTCHA_MAX_ATTEMPTS,
      windowMs: RECAPTCHA_WINDOW_MS,
      errorMessage: "Too many verification attempts. Please try again later.",
    });
  },
});

export const verify = action({
  args: {
    token: v.string(),
    identifier: v.optional(v.string()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, { token, identifier, action }) => {
    const limiterKey = (identifier ?? "anonymous").trim().toLowerCase() || "anonymous";
    await ctx.runMutation(internal.recaptcha.assertRateLimit, { key: limiterKey });

    const secret = process.env.RECAPTCHA_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("reCAPTCHA is not configured on the server.");
      }
      console.log("[DEV] reCAPTCHA verification skipped (no RECAPTCHA_SECRET)");
      return { success: true, skipped: true };
    }

    const res = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
      },
    );

    const data = await res.json();

    if (!data.success) {
      throw new Error("reCAPTCHA verification failed. Please try again.");
    }

    if (action && typeof data.action === "string" && data.action !== action) {
      throw new Error("reCAPTCHA action mismatch.");
    }

    // For reCAPTCHA v3, reject low scores (likely bots)
    const minScore = Number(process.env.RECAPTCHA_MIN_SCORE ?? "0.5");
    if (typeof data.score === "number" && data.score < minScore) {
      throw new Error("reCAPTCHA verification failed. Please try again.");
    }

    return { success: true };
  },
});
