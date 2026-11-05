import { expect, test } from "@playwright/test";

test.describe("Lights Inventory E2E Tests", () => {
	test("should load the home page", async ({ page }) => {
		await page.goto("/");
		// AuthGuard redirects to login if not authenticated
		await expect(page).toHaveURL(/.*\/login/);
	});

	test("should show login form on login page", async ({ page }) => {
		await page.goto("/login");
		await expect(page.locator('input[type="email"]')).toBeVisible();
		await expect(page.locator('input[type="password"]')).toBeVisible();
	});

	test("should have login page title", async ({ page }) => {
		await page.goto("/login");
		await expect(page).toHaveTitle(/Login/);
	});
});
