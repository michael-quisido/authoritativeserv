"use server";

import { redirect } from "next/navigation";
import { ensureSession, setSessionCookie } from "@/lib/session-cookie";
import { verifyCsrfToken, newCsrfToken, verifyOrigin } from "@/lib/csrf";
import { codeFormatOk, issueCode, verifyCode } from "@/lib/auth";
import { deleteRateLimitRecord, tryRecordRateLimit } from "@/lib/rate-limit";
import { getRuleById, getUserEmail } from "@/lib/repo";
import { sendVerificationEmail } from "@/lib/mail";
import { gateIssue } from "@/lib/guard";
import { regenerateSessionToken, updateSessionData } from "@/lib/session";

export interface GateState {
  errors: string[];
  ok?: boolean;
  message?: string;
}

export async function gateSendCode(_prev: GateState, formData: FormData): Promise<GateState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const { session } = await ensureSession();
  if (session.data.csrf && !verifyCsrfToken(session.data, formData.get("csrf"))) {
    return { errors: ["Invalid session."] };
  }
  const data = { ...session.data, csrf: session.data.csrf ?? newCsrfToken() };
  if (data.csrf !== session.data.csrf) await updateSessionData(session.id, data);
  const ruleId = Number(formData.get("rule_id"));
  const rule = await getRuleById(ruleId);
  if (!rule) return { errors: ["Unknown rule."] };
  const rateId = await tryRecordRateLimit(`rule:${ruleId}`);
  if (rateId === null) return { errors: ["Too many codes requested. Try again later."] };
  const code = await issueCode({ type: "user", adminId: null, userId: rule.associated_user_id, ruleId });
  const email = await getUserEmail(rule.associated_user_id);
  const sent = await sendVerificationEmail(email ?? "", code);
  if (!sent) {
    await deleteRateLimitRecord(rateId);
    return { errors: ["Could not send the code. Please try again."] };
  }
  return { errors: [], ok: true, message: "A verification code was sent to your email." };
}

export async function gateVerify(_prev: GateState, formData: FormData): Promise<GateState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const { session } = await ensureSession();
  if (session.data.csrf && !verifyCsrfToken(session.data, formData.get("csrf"))) {
    return { errors: ["Invalid session."] };
  }
  const ruleId = Number(formData.get("rule_id"));
  const rule = await getRuleById(ruleId);
  if (!rule) return { errors: ["Unknown rule."] };
  const input = String(formData.get("code") ?? "").trim();
  if (!codeFormatOk(input)) {
    await verifyCode({ type: "user", adminId: null, userId: rule.associated_user_id, ruleId }, input);
    return { errors: ["Code must be exactly 8 alphanumeric characters."] };
  }
  if (await verifyCode({ type: "user", adminId: null, userId: rule.associated_user_id, ruleId }, input)) {
    const data = gateIssue(session.data, ruleId);
    await updateSessionData(session.id, data);
    const newToken = await regenerateSessionToken(session.id);
    await setSessionCookie(newToken);
    redirect(rule.real_path);
  }
  return { errors: ["Invalid or expired code."] };
}
