import crypto from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import pool from "./db";
import { config } from "./config";

export interface SessionData {
  csrf?: string;
  admin_pw_ok?: number;
  admin_verified?: number;
  admin_username?: string;
  gates?: Record<string, number>;
}

export interface SessionRecord {
  id: number;
  adminId: number | null;
  data: SessionData;
  expiresAt: Date;
  lastSeenAt: Date;
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function pruneExpired(): Promise<void> {
  await pool.execute(
    `DELETE FROM sessions WHERE expires_at < NOW()
       OR last_seen_at < NOW() - INTERVAL ${config.session.idleSeconds} SECOND`
  );
}

export async function createSession(data: SessionData = {}): Promise<{ session: SessionRecord; token: string }> {
  await pruneExpired();
  const token = randomToken();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO sessions (token_hash, admin_id, data, expires_at)
     VALUES (?, ?, ?, NOW() + INTERVAL ${config.session.absoluteSeconds} SECOND)`,
    [hashToken(token), null, JSON.stringify(data)]
  );
  return {
    session: {
      id: result.insertId,
      adminId: null,
      data,
      expiresAt: new Date(Date.now() + config.session.absoluteSeconds * 1000),
      lastSeenAt: new Date(),
    },
    token,
  };
}

export async function getSessionByToken(token: string): Promise<SessionRecord | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, admin_id, data, expires_at, last_seen_at FROM sessions WHERE token_hash = ? LIMIT 1",
    [hashToken(token)]
  );
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at as Date).getTime() < Date.now()) {
    await deleteSessionById(Number(row.id));
    return null;
  }
  if (Date.now() - new Date(row.last_seen_at as Date).getTime() > config.session.idleSeconds * 1000) {
    await deleteSessionById(Number(row.id));
    return null;
  }
  await pool.execute("UPDATE sessions SET last_seen_at = NOW() WHERE id = ?", [row.id]);
  let data: SessionData = {};
  if (typeof row.data === "string") {
    try {
      data = JSON.parse(row.data) as SessionData;
    } catch {
      data = {};
    }
  } else if (row.data && typeof row.data === "object") {
    data = row.data as SessionData;
  }
  return {
    id: Number(row.id),
    adminId: (row.admin_id as number | null) ?? null,
    data,
    expiresAt: row.expires_at as Date,
    lastSeenAt: row.last_seen_at as Date,
  };
}

export async function updateSessionData(id: number, data: SessionData, adminId?: number | null): Promise<void> {
  await pool.execute("UPDATE sessions SET data = ?, admin_id = ? WHERE id = ?", [
    JSON.stringify(data),
    adminId ?? null,
    id,
  ]);
}

export async function deleteSessionById(id: number): Promise<void> {
  await pool.execute("DELETE FROM sessions WHERE id = ?", [id]);
}

export async function regenerateSessionToken(id: number): Promise<string> {
  const token = randomToken();
  await pool.execute("UPDATE sessions SET token_hash = ? WHERE id = ?", [hashToken(token), id]);
  return token;
}
