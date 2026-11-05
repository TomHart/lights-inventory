import { ConvexError } from "convex/values";

export async function emailSubject(email: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyCaptcha(
  token: unknown,
  action: string,
): Promise<void> {
  const project = process.env.RECAPTCHA_PROJECT_ID;
  const apiKey = process.env.RECAPTCHA_API_KEY;
  const siteKey = process.env.RECAPTCHA_SITE_KEY;
  if (!project || !apiKey || !siteKey) {
    throw new Error("reCAPTCHA Enterprise server configuration is required");
  }
  const failed = () =>
    new ConvexError({
      code: "RECAPTCHA_FAILED",
      message: "reCAPTCHA verification failed. Please try again.",
    });
  if (typeof token !== "string" || !token || token.length > 8192)
    throw failed();
  const minimum = Number(process.env.RECAPTCHA_MIN_SCORE ?? "0.5");
  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1)
    throw new Error("Invalid reCAPTCHA score configuration");
  let data: {
    tokenProperties?: { valid?: boolean; action?: string };
    riskAnalysis?: { score?: number };
  };
  try {
    const response = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${project}/assessments?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: { token, siteKey, expectedAction: action },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw failed();
    data = await response.json();
  } catch {
    throw failed();
  }
  const score = data?.riskAnalysis?.score;
  if (
    !data?.tokenProperties?.valid ||
    data.tokenProperties.action !== action ||
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    score < minimum
  )
    throw failed();
}
