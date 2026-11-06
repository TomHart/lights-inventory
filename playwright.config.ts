import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("E2E_PORT must be a valid unprivileged port");
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const devURL = process.env.E2E_DEV_CONVEX_URL;
if (process.env.E2E_AUTH_STATE && (!devURL || process.env.E2E_BASE_URL))
  throw new Error(
    "Authenticated tests require E2E_DEV_CONVEX_URL and a locally built frontend",
  );
if (
  devURL &&
  (new URL(devURL).protocol !== "https:" ||
    new URL(devURL).hostname === "zealous-elephant-547.convex.cloud")
)
  throw new Error(
    "Use a disposable HTTPS dev deployment, not the production backend",
  );

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "never" }]],
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm build && pnpm preview --host localhost --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        env: devURL ? { VITE_CONVEX_URL: devURL } : undefined,
        timeout: 120_000,
      },
});
