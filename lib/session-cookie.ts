import { cookies } from "next/headers";
import { config } from "./config";
import { createSession, getSessionByToken, type SessionRecord } from "./session";

export async function getCurrentSession(): Promise<SessionRecord | null> {
  const store = await cookies();
  const token = store.get(config.session.cookieName)?.value;
  if (!token) return null;
  return getSessionByToken(token);
}

export async function ensureSession(): Promise<{ session: SessionRecord; token: string }> {
  const store = await cookies();
  const existing = store.get(config.session.cookieName)?.value;
  if (existing) {
    const session = await getSessionByToken(existing);
    if (session) return { session, token: existing };
  }
  const created = await createSession();
  store.set(config.session.cookieName, created.token, sessionCookieOptions());
  return created;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(config.session.cookieName, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(config.session.cookieName);
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: config.session.secure,
    path: "/",
    maxAge: config.session.absoluteSeconds,
  };
}
