import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { sendVerificationEmail } from "@/lib/mail";

const logFile = "storage/mail.log";

beforeAll(() => {
  fs.rmSync(logFile, { force: true });
});

afterAll(() => {
  fs.rmSync(logFile, { force: true });
});

describe("mail log mode", () => {
  it("writes the verification email to the log and returns true", async () => {
    const ok = await sendVerificationEmail("test@example.com", "ABCDEFGH");
    expect(ok).toBe(true);
    const content = fs.readFileSync(logFile, "utf8");
    expect(content).toContain("TO=test@example.com");
    expect(content).toContain("verification code is: ABCDEFGH");
  });
});
