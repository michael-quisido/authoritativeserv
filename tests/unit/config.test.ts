import { describe, it, expect } from "vitest";
import { config } from "@/lib/config";

describe("config", () => {
  it("has the documented defaults", () => {
    expect(config.code.length).toBe(8);
    expect(config.code.ttlSeconds).toBe(600);
    expect(config.code.maxAttempts).toBe(5);
    expect(config.rateLimit.windowSeconds).toBe(600);
    expect(config.rateLimit.max).toBe(3);
    expect(config.session.cookieName).toBe("kmcq_sess");
    expect(config.mail.mode).toBe("log");
  });
});
