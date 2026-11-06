import { expect, test } from "@playwright/test";

const devURL = process.env.E2E_DEV_CONVEX_URL;
const authState = process.env.E2E_AUTH_STATE;

test.describe("Authenticated inventory (disposable dev deployment only)", () => {
  test.skip(
    !devURL || !authState,
    "Provide E2E_DEV_CONVEX_URL and E2E_AUTH_STATE for a disposable dev account",
  );
  test.use({ storageState: authState, actionTimeout: 5000 });
  let name = "";

  test.afterEach(async ({ page }) => {
    if (!name) return;
    await page.goto("/properties");
    await expect(
      page.getByRole("button", { name: "Add Property" }),
    ).toBeVisible();
    const property = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText(name, { exact: true }) });
    if (await property.count()) {
      await property
        .getByRole("button", { name: "Delete property", exact: true })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await expect(property).toHaveCount(0);
    }
    await page.context().storageState({ path: authState });
  });

  test("creates a property, room, fixture and bulb, changes status, exports and deletes", async ({
    page,
  }) => {
    name = `E2E ${Date.now()}`;
    await page.goto("/properties");
    await expect(
      page.getByRole("heading", { name: "Properties", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add Property" }).click();
    const dialog = page.getByRole("dialog");
    const submit = async (label: string) => {
      await dialog.getByRole("button", { name: label, exact: true }).click();
      const errorToast = page.locator('[data-sonner-toast][data-type="error"]');
      await Promise.race([
        expect(dialog).toBeHidden(),
        errorToast.waitFor().then(async () => {
          throw new Error((await errorToast.textContent()) ?? "Action failed");
        }),
      ]);
    };
    await dialog.getByPlaceholder("e.g. My Home, Beach House").fill(name);
    await submit("Create Property");
    const property = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByText(name, { exact: true }) });
    await property.getByRole("link").click();
    await page.getByRole("button", { name: "Add Room", exact: true }).click();
    await dialog
      .getByPlaceholder("e.g. Master Bedroom, Kitchen")
      .fill("E2E Room");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Bedroom", exact: true }).click();
    await submit("Create Room");
    await page
      .locator('[data-slot="card"]')
      .filter({ hasText: "E2E Room" })
      .getByRole("link")
      .click();
    await page
      .getByRole("button", { name: "Add Fixture", exact: true })
      .click();
    await dialog
      .getByPlaceholder("e.g. Main overhead, Bedside lamp")
      .fill("E2E Fixture");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Ceiling", exact: true }).click();
    await submit("Create Fixture");
    await page
      .locator('[data-slot="card"]')
      .filter({ hasText: "E2E Fixture" })
      .getByRole("link")
      .click();
    await page.getByRole("button", { name: "Add Bulb", exact: true }).click();
    await dialog.getByPlaceholder("e.g. Philips LED A19").fill("E2E Bulb");
    await submit("Add Bulb");
    const bulb = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "E2E Bulb" });
    await expect(bulb).toBeVisible();
    await bulb.getByRole("button", { name: "Dead", exact: true }).click();
    await expect(
      bulb.locator('[data-slot="badge"]').filter({ hasText: "Dead" }),
    ).toBeVisible();
    await page.goto("/");
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export Data", exact: true })
      .click();
    expect((await download).suggestedFilename()).toMatch(/\.json$/);
  });
});
