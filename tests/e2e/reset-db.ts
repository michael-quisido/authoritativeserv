import pool from "../../lib/db";
import fs from "node:fs";

export async function resetDatabase(): Promise<void> {
  await pool.execute("DELETE FROM sessions");
  await pool.execute("DELETE FROM email_rate_limits");
  await pool.execute("DELETE FROM verification_codes");
  await pool.execute("DELETE FROM url_rules");
  await pool.execute("DELETE FROM users");
  fs.rmSync("storage/mail.log", { force: true });
}
