import { test, expect } from "@playwright/test";
import { lastCodeFromLog, loginAsAdmin, resetRateLimits } from "./helpers";

test.beforeEach(async () => {
  await resetRateLimits();
});

async function createGateRule(page: import("@playwright/test").Page) {
  const uname = `gate_user_${Date.now()}`;
  const dummy = `/test-dummy-${Date.now()}`;
  const real = `/test-real-${Date.now()}`;
  await page.getByPlaceholder("Username").fill(uname);
  await page.getByPlaceholder("Password").fill("gatepass1234");
  await page.getByPlaceholder("Email").fill(`${uname}@example.com`);
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(page.locator("tr", { hasText: uname })).toBeVisible();
  await page.getByPlaceholder("/dummy").fill(dummy);
  await page.getByPlaceholder("/real").fill(real);
  await page.getByRole("combobox").selectOption({ label: uname });
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText(dummy)).toBeVisible();
  return { dummy, real };
}

test("gate: send code then verify grants the real path", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const { dummy, real } = await createGateRule(page);

  const visitor = await browser.newContext();
  const vp = await visitor.newPage();

  await vp.goto(real);
  await expect(vp.getByText("Access restricted. Please contact the administrator.")).toBeVisible();

  await vp.goto(dummy);
  await expect(vp.getByRole("heading", { name: "Restricted Area" })).toBeVisible();
  await vp.getByRole("button", { name: "Send me a code" }).click();
  await expect(vp.getByText("A verification code was sent")).toBeVisible();

  const code = await lastCodeFromLog();
  await vp.getByLabel("Code").fill(code);
  await vp.getByRole("button", { name: "Verify" }).click();
  await expect(vp).toHaveURL(real);
  await expect(vp.getByRole("heading", { name: "Protected Destination" })).toBeVisible();

  await visitor.close();
});

test("gate: five wrong codes lock the rule out", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const { dummy, real } = await createGateRule(page);

  const visitor = await browser.newContext();
  const vp = await visitor.newPage();

  await vp.goto(dummy);
  await vp.getByRole("button", { name: "Send me a code" }).click();
  await expect(vp.getByText("A verification code was sent")).toBeVisible();
  const code = await lastCodeFromLog();

  for (let i = 0; i < 5; i++) {
    await vp.getByLabel("Code").fill("WRONGCOD");
    await vp.getByRole("button", { name: "Verify" }).click();
  }
  await vp.getByLabel("Code").fill(code);
  await vp.getByRole("button", { name: "Verify" }).click();
  await expect(vp.getByText("Invalid or expired code.")).toBeVisible();

  await vp.goto(real);
  await expect(vp.getByText("Access restricted. Please contact the administrator.")).toBeVisible();

  await visitor.close();
});
