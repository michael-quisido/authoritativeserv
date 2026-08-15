import { describe, it, expect } from "vitest";
import { gateIssue, gateValid } from "@/lib/guard";

describe("gate", () => {
  it("a freshly issued gate is valid", () => {
    const data = gateIssue({}, 42);
    expect(gateValid(data, 42)).toBe(true);
  });
  it("gates are per-rule", () => {
    const data = gateIssue({}, 1);
    expect(gateValid(data, 2)).toBe(false);
  });
  it("an expired gate is invalid", () => {
    const data = gateIssue({}, 1);
    data.gates!["1"] = Math.floor(Date.now() / 1000) - 1;
    expect(gateValid(data, 1)).toBe(false);
  });
  it("no gates at all is invalid", () => {
    expect(gateValid({}, 1)).toBe(false);
  });
});
