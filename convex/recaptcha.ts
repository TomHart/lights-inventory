import { action } from "./_generated/server";
import { v } from "convex/values";

export const verify = action({
  args: { token: v.string() },
  handler: async (_ctx, { token }) => {
    const secret = process.env.RECAPTCHA_SECRET;
    if (!secret) {
      // Development fallback: skip verification when key isn't set
      console.log("[DEV] reCAPTCHA verification skipped (no RECAPTCHA_SECRET)");
      return { success: true };
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

    // For reCAPTCHA v3, reject low scores (likely bots)
    if (typeof data.score === "number" && data.score < 0.5) {
      throw new Error("reCAPTCHA verification failed. Please try again.");
    }

    return { success: true };
  },
});
