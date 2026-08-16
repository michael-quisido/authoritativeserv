import { test, expect } from "@playwright/test";
import { loginAsAdmin, resetRateLimits } from "./helpers";

test.beforeEach(async () => {
  await resetRateLimits();
});

test("settings: user/rule CRUD and validations", async ({ page }) => {
  await loginAsAdmin(page);
  const uname = `e2e_user_${Date.now()}`;
  const dummy = `/e2e-dummy-${Date.now()}`;
  const real = `/e2e-real-${Date.now()}`;

  await expect(page.getByRole("heading", { name: "Settings Dashboard" })).toBeVisible();

  await page.getByPlaceholder("Username").fill(uname);
  await page.getByPlaceholder("Password").fill("e2epass1234");
  await page.getByPlaceholder("Email").fill(`${uname}@example.com`);
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(page.locator("tr", { hasText: uname })).toBeVisible();

  await page.getByPlaceholder("/dummy").fill(dummy);
  await page.getByPlaceholder("/real").fill(real);
  await page.getByRole("combobox").selectOption({ label: uname });
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText(dummy)).toBeVisible();

  await page.getByPlaceholder("/dummy").fill("/settings");
  await page.getByPlaceholder("/real").fill("/x");
  await page.getByRole("combobox").selectOption({ label: uname });
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText("must not collide with app routes")).toBeVisible();

  await page.locator("tr", { hasText: dummy }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(dummy)).not.toBeVisible();

  await page.locator("tr", { hasText: uname }).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("tr", { hasText: uname })).not.toBeVisible();
});

test("settings: password change validations", async ({ page }) => {
  await loginAsAdmin(page);

  await page.getByLabel("Current password").fill("wrongpass");
  await page.getByLabel("New password").fill("whatever123");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Current password is incorrect.")).toBeVisible();

  await page.getByLabel("Current password").fill("pass_admin_security7777");
  await page.getByLabel("New password").fill("short");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("New password must be at least 10 characters.")).toBeVisible();
});
