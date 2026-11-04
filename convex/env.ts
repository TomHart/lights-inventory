import { v } from "convex/values";

// Environment variable schema validation
export const envSchema = v.object({
	RECAPTCHA_PROJECT_ID: v.string(),
	RECAPTCHA_API_KEY: v.string(),
	RECAPTCHA_SITE_KEY: v.string(),
	RECAPTCHA_SECRET: v.string(),
	MAILGUN_SECRET: v.string(),
	MAILGUN_DOMAIN: v.string(),
});

// Validate environment variables on startup
export function validateEnv() {
	const requiredVars = [
		"RECAPTCHA_PROJECT_ID",
		"RECAPTCHA_API_KEY",
		"RECAPTCHA_SITE_KEY",
		"RECAPTCHA_SECRET",
		"MAILGUN_SECRET",
		"MAILGUN_DOMAIN",
	];

	const missing = requiredVars.filter((varName) => !process.env[varName]);

	if (missing.length > 0) {
		throw new Error(
			`Missing required environment variables: ${missing.join(", ")}`,
		);
	}

	// Validate Convex deployment is set
	if (!process.env.CONVEX_DEPLOYMENT) {
		throw new Error("CONVEX_DEPLOYMENT environment variable is not set");
	}
}

// Export typed environment variables
export const env = {
	RECAPTCHA_PROJECT_ID: process.env.RECAPTCHA_PROJECT_ID!,
	RECAPTCHA_API_KEY: process.env.RECAPTCHA_API_KEY!,
	RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY!,
	RECAPTCHA_SECRET: process.env.RECAPTCHA_SECRET!,
	MAILGUN_SECRET: process.env.MAILGUN_SECRET!,
	MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN!,
	CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT!,
};
