import {
  ConvexCredentials,
  type ConvexCredentialsUserConfig,
} from "@convex-dev/auth/providers/ConvexCredentials";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { emailSubject, verifyCaptcha } from "./recaptcha";

const passwordProvider = Password({
  verify: Email({
    id: "verification-code",
    maxAge: 60 * 60, // 1 hour
    async sendVerificationRequest(
      { identifier: email, token },
      ctx?: ActionCtx,
    ) {
      if (!ctx) throw new Error("Missing verification action context");
      // Rate limit: max 5 verification requests per hour per email
      await ctx.runMutation(internal.rateLimit.authAttempt, {
        subject: await emailSubject(email),
        emailVerification: true,
      });
      const apiKey = process.env.MAILGUN_SECRET;
      if (!apiKey) {
        if (process.env.NODE_ENV === "production") {
          throw new Error("MAILGUN_SECRET is required in production.");
        }

        // Development fallback: log the code to the Convex dashboard
        // Note: In production, use a proper logging service instead of console.log
        console.log(`[DEV ONLY] Verification code for ${email}: ${token}`);
        return;
      }
      const domain = process.env.MAILGUN_DOMAIN ?? "mail.example.com";
      const fromAddress =
        process.env.AUTH_EMAIL_FROM ?? `Lights Inventory <noreply@${domain}>`;
      const form = new URLSearchParams();
      form.append("from", fromAddress);
      form.append("to", email);
      form.append("subject", "Verify your email - Lights Inventory");
      form.append(
        "html",
        [
          "<h2>Verify your email</h2>",
          `<p>Your verification code is: <strong>${token}</strong></p>`,
          "<p>This code expires in 1 hour.</p>",
        ].join(""),
      );
      const mailgunBase =
        process.env.MAILGUN_API_URL ?? "https://api.eu.mailgun.net";
      const res = await fetch(`${mailgunBase}/v3/${domain}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
        },
        body: form,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to send verification email: ${body}`);
      }
    },
  }),
});

const passwordOptions = (
  passwordProvider as typeof passwordProvider & {
    options: ConvexCredentialsUserConfig;
  }
).options;

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    ConvexCredentials({
      ...passwordOptions,
      authorize: async (params, ctx) => {
        const email =
          typeof params.email === "string" ? params.email.trim() : "";
        if (!email || email.length > 254 || !email.includes("@"))
          throw new ConvexError("Enter a valid email address");
        const flow = params.flow;
        if (
          flow !== "signIn" &&
          flow !== "signUp" &&
          flow !== "email-verification"
        )
          throw new ConvexError("Unsupported authentication flow");
        await ctx.runMutation(internal.rateLimit.authAttempt, {
          subject: await emailSubject(email),
          emailVerification: false,
        });
        if (flow === "signIn" || flow === "signUp")
          await verifyCaptcha(params.recaptchaToken, flow);
        return passwordOptions.authorize({ ...params, email }, ctx);
      },
    }),
  ],
});
