import type { ResultSetHeader } from "mysql2";
import pool from "./db";
import { config } from "./config";

export async function tryRecordRateLimit(scope: string): Promise<number | null> {
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO email_rate_limits (scope_key, window_start)
       SELECT ?, NOW() FROM dual
       WHERE (SELECT COUNT(*) FROM email_rate_limits
              WHERE scope_key = ? AND window_start >= (NOW() - INTERVAL ${config.rateLimit.windowSeconds} SECOND)) < ${config.rateLimit.max}`,
      [scope, scope]
    );
    return result.insertId || null;
  } catch {
    return null;
  }
}

export async function deleteRateLimitRecord(id: number): Promise<void> {
  await pool.execute("DELETE FROM email_rate_limits WHERE id = ?", [id]);
}
