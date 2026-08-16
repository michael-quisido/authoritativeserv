import crypto from "node:crypto";
import { headers } from "next/headers";
import type { SessionData } from "./session";

export function newCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function verifyCsrfToken(data: SessionData | null | undefined, submitted: unknown): boolean {
  const expected = data?.csrf;
  if (!expected || typeof submitted !== "string" || submitted === "") return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(submitted, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function verifyOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host;
  } catch {
    return false;
  }
}
