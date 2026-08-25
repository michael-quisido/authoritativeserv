import type { RowDataPacket } from "mysql2";
import pool from "./db";

export interface UserRow {
  id: number;
  username: string;
  email: string;
  created_at: Date;
}

export interface RuleRow {
  id: number;
  dummy_path: string;
  real_path: string;
  associated_user_id: number;
  created_at: Date;
}

export interface RuleWithUser extends RuleRow {
  username: string;
}

export async function getAdminEmail(adminId: number): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT email FROM admins WHERE id = ? LIMIT 1", [adminId]);
  return rows[0] ? (rows[0].email as string) : null;
}

export async function getUserEmail(userId: number): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT email FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0] ? (rows[0].email as string) : null;
}

export async function getUserById(userId: number): Promise<UserRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0] ? (rows[0] as UserRow) : null;
}

export async function getRuleById(ruleId: number): Promise<RuleRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT * FROM url_rules WHERE id = ? LIMIT 1", [ruleId]);
  return rows[0] ? (rows[0] as RuleRow) : null;
}

function normalizePath(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

export async function getRuleByRealPath(path: string): Promise<RuleRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM url_rules WHERE TRIM(TRAILING '/' FROM real_path) = ? LIMIT 1",
    [normalizePath(path)],
  );
  return rows[0] ? (rows[0] as RuleRow) : null;
}

export async function getRuleByRealPathPrefix(path: string): Promise<RuleRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM url_rules WHERE ? LIKE CONCAT(TRIM(TRAILING '/' FROM real_path), '/%') LIMIT 1",
    [path],
  );
  return rows[0] ? (rows[0] as RuleRow) : null;
}

export async function getRuleByDummyPath(path: string): Promise<RuleRow | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM url_rules WHERE TRIM(TRAILING '/' FROM dummy_path) = ? LIMIT 1",
    [normalizePath(path)],
  );
  return rows[0] ? (rows[0] as RuleRow) : null;
}

export async function listUsers(): Promise<UserRow[]> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT id, username, email, created_at FROM users ORDER BY id");
  return rows as UserRow[];
}

export async function listRules(): Promise<RuleWithUser[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT r.id, r.dummy_path, r.real_path, r.associated_user_id, r.created_at, u.username FROM url_rules r JOIN users u ON u.id = r.associated_user_id ORDER BY r.id"
  );
  return rows as RuleWithUser[];
}

export async function insertUser(username: string, passwordHash: string, email: string): Promise<void> {
  await pool.execute("INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)", [
    username,
    passwordHash,
    email,
  ]);
}

export async function deleteUser(id: number): Promise<void> {
  await pool.execute("DELETE FROM users WHERE id = ?", [id]);
}

export async function insertRule(dummyPath: string, realPath: string, userId: number): Promise<void> {
  await pool.execute("INSERT INTO url_rules (dummy_path, real_path, associated_user_id) VALUES (?, ?, ?)", [
    dummyPath,
    realPath,
    userId,
  ]);
}

export async function deleteRule(id: number): Promise<void> {
  await pool.execute("DELETE FROM url_rules WHERE id = ?", [id]);
}

export async function getAdminPasswordHash(adminId: number): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>("SELECT password_hash FROM admins WHERE id = ? LIMIT 1", [adminId]);
  return rows[0] ? (rows[0].password_hash as string) : null;
}

export async function updateAdminPassword(adminId: number, passwordHash: string): Promise<void> {
  await pool.execute("UPDATE admins SET password_hash = ? WHERE id = ?", [passwordHash, adminId]);
}

export async function rulePathCollisions(dummyPath: string, realPath: string): Promise<RuleRow[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM url_rules
     WHERE LOWER(dummy_path) = LOWER(?) OR LOWER(real_path) = LOWER(?)
        OR LOWER(real_path) = LOWER(?) OR LOWER(dummy_path) = LOWER(?)`,
    [dummyPath, dummyPath, realPath, realPath]
  );
  return rows as RuleRow[];
}
