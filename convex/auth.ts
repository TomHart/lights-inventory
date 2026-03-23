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
          const apiKey = process.env.MAILGUN_SECRET;
          if (!apiKey) {
            // Development fallback: log the code to the Convex dashboard
            console.log(
              `[DEV ONLY] Verification code for ${email}: ${token}`,
            );
            return;
          }
          const domain =
            process.env.MAILGUN_DOMAIN ?? "mail.example.com";
          const fromAddress =
            process.env.AUTH_EMAIL_FROM ??
            "Lights Inventory <noreply@" + domain + ">";
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
          const res = await fetch(
            `${mailgunBase}/v3/${domain}/messages`,
            {
              method: "POST",
              headers: {
                Authorization:
                  "Basic " + btoa("api:" + apiKey),
              },
              body: form,
            },
          );
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to send verification email: ${body}`);
          }
        },
      }),
    }),
  ],
});
