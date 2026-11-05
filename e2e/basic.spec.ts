import { expect, test } from "@playwright/test";

test.describe("Lights Inventory E2E Tests", () => {
  test("should load the home page", async ({ page }) => {
    await page.goto("/");
    // AuthGuard redirects to login if not authenticated
    await expect(page).toHaveURL(/.*\/login/);
  });

  test("should serve protected deep links from the production build", async ({
    page,
  }) => {
    const response = await page.goto("/properties");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("should serve public assets at the site root", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(await response.text()).toContain("User-agent:");
  });

  test("should show login form on login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
