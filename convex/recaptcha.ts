import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { enforceRateLimit } from "./rateLimit";

const RECAPTCHA_WINDOW_MS = 10 * 60 * 1000;
const RECAPTCHA_MAX_ATTEMPTS = 20;
const RECAPTCHA_GLOBAL_MAX_ATTEMPTS = 300;

const RECAPTCHA_ENTERPRISE_PROJECT_ID = process.env.RECAPTCHA_PROJECT_ID;
const RECAPTCHA_ENTERPRISE_API_KEY = process.env.RECAPTCHA_API_KEY;
const RECAPTCHA_ENTERPRISE_SITE_KEY = process.env.RECAPTCHA_SITE_KEY;
const HAS_RECAPTCHA_ENTERPRISE_CONFIG =
  !!RECAPTCHA_ENTERPRISE_PROJECT_ID &&
  !!RECAPTCHA_ENTERPRISE_API_KEY &&
  !!RECAPTCHA_ENTERPRISE_SITE_KEY;
const RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE ?? "0.5");

function logRecaptchaFailure(
  stage: string,
  details: Record<string, unknown>,
) {
  console.error(`[reCAPTCHA] ${stage}`, details);
}

export const assertRateLimit = internalMutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, { key }) => {
    const limit = key === "global:all" ? RECAPTCHA_GLOBAL_MAX_ATTEMPTS : RECAPTCHA_MAX_ATTEMPTS;
    await enforceRateLimit(ctx, {
      key: `recaptcha:${key}`,
      limit,
      windowMs: RECAPTCHA_WINDOW_MS,
      errorMessage: "Too many verification attempts. Please try again later.",
    });
  },
});

export const verify = action({
  args: {
    token: v.string(),
    action: v.optional(v.string()),
  },
  handler: async (ctx, { token, action }) => {
    const actionBucket =
      typeof action === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(action)
        ? action
        : "generic";

    await ctx.runMutation(internal.recaptcha.assertRateLimit, {
      key: `global:${actionBucket}`,
    });
    await ctx.runMutation(internal.recaptcha.assertRateLimit, {
      key: "global:all",
    });

    if (!HAS_RECAPTCHA_ENTERPRISE_CONFIG) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("reCAPTCHA Enterprise is not configured on the server.");
      }
      console.log("[DEV] reCAPTCHA Enterprise verification skipped (missing config)");
      return { success: true, skipped: true };
    }

    const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${RECAPTCHA_ENTERPRISE_PROJECT_ID}/assessments?key=${RECAPTCHA_ENTERPRISE_API_KEY}`;
    let res: Response;
    try {
      res = await fetch(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: {
              token,
              siteKey: RECAPTCHA_ENTERPRISE_SITE_KEY,
              expectedAction: actionBucket,
            },
          }),
        },
      );
    } catch (error) {
      logRecaptchaFailure("enterprise verification request failed", {
        action: actionBucket,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error("reCAPTCHA verification failed. Please try again.");
    }

    const rawBody = await res.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { rawBody };
    }

    if (!res.ok) {
      logRecaptchaFailure("enterprise upstream response was not ok", {
        action: actionBucket,
        status: res.status,
        statusText: res.statusText,
        body: rawBody,
      });
      throw new Error("reCAPTCHA verification failed. Please try again.");
    }

    const tokenProperties = data?.tokenProperties ?? {};
    const riskAnalysis = data?.riskAnalysis ?? {};

    if (!tokenProperties.valid) {
      logRecaptchaFailure("enterprise token invalid", {
        action: actionBucket,
        invalidReason: tokenProperties.invalidReason,
        tokenProperties,
      });
      throw new Error("reCAPTCHA verification failed. Please try again.");
    }

    if (
      action &&
      typeof tokenProperties.action === "string" &&
      tokenProperties.action !== action
    ) {
      logRecaptchaFailure("enterprise action mismatch", {
        requestedAction: action,
        returnedAction: tokenProperties.action,
        tokenProperties,
      });
      throw new Error("reCAPTCHA action mismatch.");
    }

    if (
      typeof riskAnalysis.score === "number" &&
      riskAnalysis.score < RECAPTCHA_MIN_SCORE
    ) {
      logRecaptchaFailure("enterprise score below minimum", {
        action: actionBucket,
        score: riskAnalysis.score,
        minScore: RECAPTCHA_MIN_SCORE,
        reasons: riskAnalysis.reasons,
      });
      throw new Error("reCAPTCHA verification failed. Please try again.");
    }

    return { success: true, enterprise: true };
  },
});
