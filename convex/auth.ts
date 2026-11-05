import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

// Simple in-memory rate limiting for auth requests
// Note: In a production environment with multiple Convex instances,
// this should be replaced with a Convex-based rate limiter
const authRateLimitMap = new Map<
	string,
	{ count: number; lastRequest: number }
>();

function checkAuthRateLimit(email: string): boolean {
	const now = Date.now();
	const windowMs = 60 * 60 * 1000; // 1 hour
	const maxRequests = 5; // Max 5 requests per hour per email

	const record = authRateLimitMap.get(email);

	if (!record) {
		authRateLimitMap.set(email, { count: 1, lastRequest: now });
		return true;
	}

	if (now - record.lastRequest >= windowMs) {
		// Reset window
		authRateLimitMap.set(email, { count: 1, lastRequest: now });
		return true;
	}

	if (record.count >= maxRequests) {
		return false;
	}

	record.count++;
	record.lastRequest = now;
	return true;
}

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
					// Rate limit: max 5 verification requests per hour per email
					if (!checkAuthRateLimit(email)) {
						throw new Error(
							"Too many verification requests. Please try again later.",
						);
					}
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
						process.env.AUTH_EMAIL_FROM ??
						`Lights Inventory <noreply@${domain}>`;
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
		}),
	],
});
