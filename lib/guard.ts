import { config } from "./config";
import type { SessionData } from "./session";

export function gateIssue(data: SessionData, ruleId: number): SessionData {
  return {
    ...data,
    gates: { ...(data.gates ?? {}), [String(ruleId)]: Math.floor(Date.now() / 1000) + config.code.ttlSeconds },
  };
}

export function gateValid(data: SessionData | null | undefined, ruleId: number): boolean {
  const expires = data?.gates?.[String(ruleId)];
  if (!expires) return false;
  return expires > Math.floor(Date.now() / 1000);
}
