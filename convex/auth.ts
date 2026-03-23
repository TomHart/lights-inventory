import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { Email } from "@convex-dev/auth/providers/Email";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      verify: Email({
        id: "verification-code",
        maxAge: 60 * 60, // 1 hour
        async sendVerificationRequest({
          identifier: email,
          token,
        }: {
          identifier: string;
          token: string;
        }) {
          const apiKey = process.env.RESEND_API_KEY;
          if (!apiKey) {
            // Development fallback: log the code to the Convex dashboard
            console.log(
              `[DEV] Verification code for ${email}: ${token}`,
            );
            return;
          }
          const fromAddress =
            process.env.AUTH_EMAIL_FROM ??
            "Lights Inventory <noreply@example.com>";
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromAddress,
              to: [email],
              subject: "Verify your email - Lights Inventory",
              html: [
                "<h2>Verify your email</h2>",
                `<p>Your verification code is: <strong>${token}</strong></p>`,
                "<p>This code expires in 1 hour.</p>",
              ].join(""),
            }),
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to send verification email: ${body}`);
          }
        },
      }),
    }),
  ],
});
