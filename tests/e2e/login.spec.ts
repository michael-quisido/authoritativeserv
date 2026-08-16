import { test, expect } from "@playwright/test";
import { lastCodeFromLog, loginAsAdmin, resetRateLimits } from "./helpers";

test.beforeEach(async () => {
  await resetRateLimits();
});

test("login: wrong password stays on login, correct password verifies to settings", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Admin Login" })).toBeVisible();

  await page.getByLabel("Username").fill("admin_security");
  await page.getByLabel("Password").fill("wrongpass");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();

  await page.getByLabel("Username").fill("admin_security");
  await page.getByLabel("Password").fill("pass_admin_security7777");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\/code/);

  const code = await lastCodeFromLog();
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("heading", { name: "Settings Dashboard" })).toBeVisible();
});

test("logout returns to login", async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login/);
});
