import { describe, it, expect } from "vitest";
import { normalizePath, collidesWithAppRoutes, RESERVED_PATHS } from "@/lib/rules";

describe("normalizePath", () => {
  it("adds a leading slash", () => {
    expect(normalizePath("settings")).toBe("/settings");
  });
  it("strips trailing slashes", () => {
    expect(normalizePath("/foo/bar/")).toBe("/foo/bar");
  });
  it("keeps inner slashes", () => {
    expect(normalizePath("/foo/bar")).toBe("/foo/bar");
  });
  it("rejects empty input", () => {
    expect(normalizePath("")).toBeNull();
  });
  it("rejects whitespace", () => {
    expect(normalizePath("   ")).toBeNull();
  });
  it("rejects the root", () => {
    expect(normalizePath("/")).toBeNull();
  });
  it("rejects protocol-relative paths (open-redirect guard)", () => {
    expect(normalizePath("//evil.com")).toBeNull();
    expect(normalizePath(" //evil.com/foo ")).toBeNull();
  });
  it("rejects scheme-full paths (open-redirect guard)", () => {
    expect(normalizePath("https://evil.com")).toBeNull();
    expect(normalizePath("javascript:alert(1)")).toBeNull();
  });
});

describe("collidesWithAppRoutes", () => {
  it.each(RESERVED_PATHS)("rejects %s", (p) => {
    expect(collidesWithAppRoutes(p)).toBe(true);
  });
  it("rejects case variants (DB collation is case-insensitive)", () => {
    expect(collidesWithAppRoutes("/SETTINGS")).toBe(true);
    expect(collidesWithAppRoutes("/Login")).toBe(true);
  });
  it("allows ordinary paths", () => {
    expect(collidesWithAppRoutes("/administrators")).toBe(false);
  });
});
