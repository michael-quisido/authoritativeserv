import { describe, it, expect } from "vitest";
import { newCsrfToken, verifyCsrfToken } from "@/lib/csrf";

describe("csrf", () => {
  it("accepts a matching token", () => {
    const token = newCsrfToken();
    expect(verifyCsrfToken({ csrf: token }, token)).toBe(true);
  });
  it("rejects a wrong token", () => {
    const token = newCsrfToken();
    expect(verifyCsrfToken({ csrf: token }, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")).toBe(false);
  });
  it("rejects when no csrf is stored", () => {
    expect(verifyCsrfToken({}, "abcdef")).toBe(false);
  });
  it("rejects non-string input", () => {
    const token = newCsrfToken();
    expect(verifyCsrfToken({ csrf: token }, null)).toBe(false);
  });
});
