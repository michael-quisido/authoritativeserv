import { describe, it, expect, afterAll } from "vitest";
import pool from "@/lib/db";
import { tryRecordRateLimit, deleteRateLimitRecord } from "@/lib/rate-limit";

const scope = `unit_rl_${Date.now()}`;

afterAll(async () => {
  await pool.execute("DELETE FROM email_rate_limits WHERE scope_key = ?", [scope]);
});

describe("rate limiting", () => {
  it("allows up to max then blocks", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await tryRecordRateLimit(scope);
      expect(id).not.toBeNull();
      ids.push(id as number);
    }
    expect(await tryRecordRateLimit(scope)).toBeNull();
    for (const id of ids) await deleteRateLimitRecord(id);
  });
});
