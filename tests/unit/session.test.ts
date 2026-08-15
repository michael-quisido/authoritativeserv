import { describe, it, expect, afterAll } from "vitest";
import {
  createSession,
  getSessionByToken,
  updateSessionData,
  deleteSessionById,
  regenerateSessionToken,
} from "@/lib/session";

const ids: number[] = [];

afterAll(async () => {
  for (const id of ids) await deleteSessionById(id);
});

describe("sessions", () => {
  it("creates and reads a session", async () => {
    const { session, token } = await createSession({ csrf: "abc" });
    ids.push(session.id);
    const got = await getSessionByToken(token);
    expect(got).not.toBeNull();
    expect(got!.data.csrf).toBe("abc");
  });
  it("returns null for an unknown token", async () => {
    expect(await getSessionByToken("deadbeef".repeat(8))).toBeNull();
  });
  it("updates data and admin_id", async () => {
    const { session, token } = await createSession({});
    ids.push(session.id);
    await updateSessionData(session.id, { admin_pw_ok: 1 }, 1);
    const got = await getSessionByToken(token);
    expect(got!.adminId).toBe(1);
    expect(got!.data.admin_pw_ok).toBe(1);
  });
  it("regenerates the token, invalidating the old one", async () => {
    const { session, token } = await createSession({});
    ids.push(session.id);
    const newToken = await regenerateSessionToken(session.id);
    expect(newToken).not.toBe(token);
    expect(await getSessionByToken(token)).toBeNull();
    expect(await getSessionByToken(newToken)).not.toBeNull();
  });
  it("deletes a session", async () => {
    const { session, token } = await createSession({});
    await deleteSessionById(session.id);
    expect(await getSessionByToken(token)).toBeNull();
  });
});
