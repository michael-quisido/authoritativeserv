import fs from "node:fs";
import { expect, type Page } from "@playwright/test";
import pool from "../../lib/db";

export async function lastCodeFromLog(logFile = "storage/mail.log"): Promise<string> {
  const content = fs.readFileSync(logFile, "utf8");
  const matches = content.match(/verification code is: ([A-Za-z0-9]{8})/g);
  const last = matches?.at(-1);
  if (!last) throw new Error("no code found in mail.log");
  return last.slice(-8);
}

export async function resetRateLimits(): Promise<void> {
  await pool.execute("DELETE FROM email_rate_limits");
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin_security");
  await page.getByLabel("Password").fill("pass_admin_security7777");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\/code/);
  const code = await lastCodeFromLog();
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/settings/);
}
