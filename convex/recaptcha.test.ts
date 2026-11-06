import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { emailSubject, verifyCaptcha } from "./recaptcha";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const configure = () => {
  vi.stubEnv("RECAPTCHA_PROJECT_ID", "test-project");
  vi.stubEnv("RECAPTCHA_API_KEY", "test-key");
  vi.stubEnv("RECAPTCHA_SITE_KEY", "test-site");
  vi.stubEnv("RECAPTCHA_MIN_SCORE", "0.5");
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("server-enforced CAPTCHA", () => {
  it("normalizes and hashes email rate-limit subjects", async () => {
    expect(await emailSubject(" USER@example.com ")).toBe(
      await emailSubject("user@example.com"),
    );
    expect(await emailSubject("user@example.com")).toHaveLength(64);
  });
  it("fails closed without server configuration", async () => {
    vi.stubEnv("RECAPTCHA_PROJECT_ID", "");
    await expect(verifyCaptcha("token", "signIn")).rejects.toThrow(
      "configuration",
    );
  });
  it.each([undefined, "", 42])("rejects a missing token", async (token) => {
    configure();
    await expect(verifyCaptcha(token, "signIn")).rejects.toThrow();
  });
  it.each([
    {
      tokenProperties: { valid: false, action: "signIn" },
      riskAnalysis: { score: 1 },
    },
    {
      tokenProperties: { valid: true, action: "signUp" },
      riskAnalysis: { score: 1 },
    },
    {
      tokenProperties: { valid: true, action: "signIn" },
      riskAnalysis: { score: 0.1 },
    },
    { tokenProperties: { valid: true, action: "signIn" } },
    null,
  ])(
    "rejects invalid, wrong-action, low-score and malformed assessments",
    async (data) => {
      configure();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(data))),
      );
      await expect(verifyCaptcha("token", "signIn")).rejects.toThrow();
    },
  );
  it("accepts a valid assessment bound to the expected action", async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tokenProperties: { valid: true, action: "signIn" },
          riskAnalysis: { score: 0.9 },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyCaptcha("token", "signIn")).resolves.toBeUndefined();
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body).event.expectedAction,
    ).toBe("signIn");
  });
  it("rejects direct sign-in and sign-up without CAPTCHA and persists attempt counts", async () => {
    configure();
    const t = convexTest(schema, modules);
    for (const flow of ["signIn", "signUp"]) {
      await expect(
        t.action(api.auth.signIn, {
          provider: "password",
          params: {
            email: "test@example.com",
            password: "Test-password1",
            flow,
          },
        }),
      ).rejects.toThrow();
    }
    const buckets = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(2);
  });
});
