import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import {
  adminPasswordOk,
  generateCode,
  hashCode,
  issueCode,
  verifyCode,
  codeFormatOk,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

const username = `unit_auth_${Date.now()}`;
let userId = 0;

beforeAll(async () => {
  const [result] = await pool.execute<ResultSetHeader>(
    "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
    [username, hashPassword("unitpass123"), `${username}@example.com`]
  );
  userId = Number(result.insertId);
});

afterAll(async () => {
  await pool.execute("DELETE FROM verification_codes WHERE user_id = ?", [userId]);
  await pool.execute("DELETE FROM users WHERE id = ?", [userId]);
});

describe("password helpers", () => {
  it("verifies the seeded PHP $2y$ bcrypt hash", async () => {
    const id = await adminPasswordOk("admin_security", "pass_admin_security7777");
    expect(id).toBeTypeOf("number");
  });
  it("rejects a wrong password", async () => {
    expect(await adminPasswordOk("admin_security", "nope")).toBeNull();
  });
  it("returns null for an unknown admin", async () => {
    expect(await adminPasswordOk("no_such_admin_xyz", "anything")).toBeNull();
  });
  it("hash/verify roundtrips", () => {
    const h = hashPassword("pass1234567");
    expect(verifyPassword("pass1234567", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
});

describe("code generation", () => {
  it("generates 8 alphanumeric characters", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateCode()).toMatch(/^[A-Za-z0-9]{8}$/);
    }
  });
  it("validates format", () => {
    expect(codeFormatOk("AbC12345")).toBe(true);
    expect(codeFormatOk("WRONGCODE")).toBe(false);
    expect(codeFormatOk("abc")).toBe(false);
  });
  it("hash is deterministic and not the plaintext", () => {
    expect(hashCode("abc12345")).toBe(hashCode("abc12345"));
    expect(hashCode("abc12345")).not.toContain("abc12345");
  });
});

describe("verify_code flow", () => {
  it("rejects wrong code, accepts correct, single use", async () => {
    const code = await issueCode({ type: "user", adminId: null, userId, ruleId: null });
    expect(await verifyCode({ type: "user", adminId: null, userId, ruleId: null }, "WRONGWRONG")).toBe(false);
    expect(await verifyCode({ type: "user", adminId: null, userId, ruleId: null }, code)).toBe(true);
    expect(await verifyCode({ type: "user", adminId: null, userId, ruleId: null }, code)).toBe(false);
  });
  it("locks the code after 5 attempts", async () => {
    const code = await issueCode({ type: "user", adminId: null, userId, ruleId: null });
    for (let i = 0; i < 5; i++) {
      await verifyCode({ type: "user", adminId: null, userId, ruleId: null }, "BADCODE0");
    }
    expect(await verifyCode({ type: "user", adminId: null, userId, ruleId: null }, code)).toBe(false);
  });
  it("returns false when no code exists for the scope", async () => {
    expect(
      await verifyCode({ type: "user", adminId: null, userId: 999999999, ruleId: null }, "ABCDEFGH")
    ).toBe(false);
  });
});
