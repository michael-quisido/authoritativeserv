"use server";

import { redirect } from "next/navigation";
import { ensureSession, getCurrentSession, setSessionCookie, clearSessionCookie } from "@/lib/session-cookie";
import { newCsrfToken, verifyCsrfToken, verifyOrigin } from "@/lib/csrf";
import { adminPasswordOk, codeFormatOk, issueCode, verifyCode } from "@/lib/auth";
import { tryRecordRateLimit } from "@/lib/rate-limit";
import { getAdminEmail } from "@/lib/repo";
import { sendVerificationEmail } from "@/lib/mail";
import { regenerateSessionToken, updateSessionData, deleteSessionById } from "@/lib/session";

export interface FormState {
  errors: string[];
  ok?: boolean;
  message?: string;
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const { session } = await ensureSession();
  if (session.data.csrf && !verifyCsrfToken(session.data, formData.get("csrf"))) {
    return { errors: ["Invalid session."] };
  }
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const adminId = await adminPasswordOk(username, password);
  if (adminId === null) return { errors: ["Invalid username or password."] };
  if (!(await tryRecordRateLimit(`admin:${adminId}`))) {
    return { errors: ["Too many codes requested. Try again later."] };
  }
  const code = await issueCode({ type: "admin", adminId, userId: null, ruleId: null });
  const email = await getAdminEmail(adminId);
  await sendVerificationEmail(email ?? "", code);
  const data = {
    ...session.data,
    csrf: session.data.csrf ?? newCsrfToken(),
    admin_pw_ok: adminId,
    admin_username: username,
  };
  await updateSessionData(session.id, data, adminId);
  const newToken = await regenerateSessionToken(session.id);
  await setSessionCookie(newToken);
  redirect("/login/code");
}

export async function verifyAdminCode(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.data.admin_pw_ok) redirect("/login");
  if (session.data.csrf && !verifyCsrfToken(session.data, formData.get("csrf"))) {
    return { errors: ["Invalid session."] };
  }
  const input = String(formData.get("code") ?? "").trim();
  if (!codeFormatOk(input)) return { errors: ["Code must be exactly 8 alphanumeric characters."] };
  const adminId = session.data.admin_pw_ok;
  if (await verifyCode({ type: "admin", adminId, userId: null, ruleId: null }, input)) {
    const data = { ...session.data, admin_verified: adminId };
    delete data.admin_pw_ok;
    await updateSessionData(session.id, data, adminId);
    const newToken = await regenerateSessionToken(session.id);
    await setSessionCookie(newToken);
    redirect("/settings");
  }
  return { errors: ["Invalid or expired code."] };
}

export async function resendCode(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.data.admin_pw_ok) redirect("/login");
  if (session.data.csrf && !verifyCsrfToken(session.data, formData.get("csrf"))) {
    return { errors: ["Invalid session."] };
  }
  const adminId = session.data.admin_pw_ok;
  if (!(await tryRecordRateLimit(`admin:${adminId}`))) {
    return { errors: ["Too many requests. Try again later."] };
  }
  const code = await issueCode({ type: "admin", adminId, userId: null, ruleId: null });
  const email = await getAdminEmail(adminId);
  await sendVerificationEmail(email ?? "", code);
  return { errors: [], ok: true, message: "New code sent." };
}

export async function logout(): Promise<void> {
  if (await verifyOrigin()) {
    const session = await getCurrentSession();
    if (session) await deleteSessionById(session.id);
  }
  await clearSessionCookie();
  redirect("/login");
}
