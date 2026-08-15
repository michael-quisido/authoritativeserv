import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "./db";
import { config } from "./config";

const CODE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const DUMMY_PASSWORD_HASH = "$2y$12$n9FAyfQMhdNYNVku.aDm4eReZhwO7mEiwajXVjrvrKr6l2f4KgqiO";

export function generateCode(length: number = config.code.length): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }
  return out;
}

export function hashCode(code: string): string {
  return crypto.createHmac("sha256", config.code.key).update(code).digest("hex");
}

export function codeFormatOk(code: string): boolean {
  return new RegExp(`^[A-Za-z0-9]{${config.code.length}}$`).test(code);
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export interface CodeTarget {
  type: "admin" | "user";
  adminId: number | null;
  userId: number | null;
  ruleId: number | null;
}

export async function issueCode(target: CodeTarget): Promise<string> {
  const code = generateCode();
  await pool.execute(
    `INSERT INTO verification_codes (type, admin_id, user_id, rule_id, code_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL ${config.code.ttlSeconds} SECOND)`,
    [target.type, target.adminId, target.userId, target.ruleId, hashCode(code)]
  );
  return code;
}

export async function verifyCode(target: CodeTarget, input: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, code_hash, attempts, expires_at FROM verification_codes
     WHERE type = ? AND admin_id <=> ? AND user_id <=> ? AND rule_id <=> ? AND used_at IS NULL
     ORDER BY id DESC LIMIT 1`,
    [target.type, target.adminId, target.userId, target.ruleId]
  );
  const row = rows[0];
  if (!row) return false;
  const expired = new Date(row.expires_at as Date).getTime() < Date.now();
  if (Number(row.attempts) >= config.code.maxAttempts || expired) {
    await pool.execute("UPDATE verification_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL", [row.id]);
    return false;
  }
  if (!timingSafeEqualHex(row.code_hash as string, hashCode(input))) {
    await pool.execute("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?", [row.id]);
    return false;
  }
  const [result] = await pool.execute<ResultSetHeader>(
    "UPDATE verification_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL AND attempts < ?",
    [row.id, config.code.maxAttempts]
  );
  return result.affectedRows === 1;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export async function adminPasswordOk(username: string, password: string): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, password_hash FROM admins WHERE username = ? LIMIT 1",
    [username]
  );
  const row = rows[0];
  const hash = row ? (row.password_hash as string) : DUMMY_PASSWORD_HASH;
  const ok = verifyPassword(password, hash);
  if (!row || !ok) return null;
  return Number(row.id);
}
