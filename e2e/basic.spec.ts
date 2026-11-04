import { expect, test } from "@playwright/test";

test.describe("Lights Inventory E2E Tests", () => {
	test("should load the home page", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/Lights Inventory/);
	});

	test("should navigate to login page", async ({ page }) => {
		await page.goto("/");
		await page.click('text="Login"');
		await expect(page).toHaveURL(/.*\/login/);
	});

	test("should show login form", async ({ page }) => {
		await page.goto("/login");
		await expect(page.locator('input[type="email"]')).toBeVisible();
		await expect(page.locator('input[type="password"]')).toBeVisible();
	});
});
