"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session-cookie";
import { verifyCsrfToken, verifyOrigin } from "@/lib/csrf";
import { hashPassword, verifyPassword } from "@/lib/auth";
import {
  deleteUser,
  getAdminPasswordHash,
  insertRule,
  insertUser,
  rulePathCollisions,
  updateAdminPassword,
  deleteRule,
  getUserById,
} from "@/lib/repo";
import { collidesWithAppRoutes, normalizePath } from "@/lib/rules";
import { regenerateSessionToken, updateSessionData } from "@/lib/session";
import { setSessionCookie } from "@/lib/session-cookie";

export interface SettingsState {
  errors: string[];
  ok?: boolean;
  message?: string;
}

async function requireAdminVerified() {
  const session = await getCurrentSession();
  if (!session || !session.data.admin_verified) redirect("/login");
  return session;
}

function isDupEntry(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ER_DUP_ENTRY";
}

export async function addUser(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await requireAdminVerified();
  if (!verifyCsrfToken(session.data, formData.get("csrf"))) return { errors: ["Invalid session."] };
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (username === "" || password.length < 10 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { errors: ["Valid username, password (10+ chars) and email required."] };
  }
  try {
    await insertUser(username, hashPassword(password), email);
  } catch (err) {
    if (isDupEntry(err)) return { errors: ["Username or email already exists."] };
    throw err;
  }
  revalidatePath("/settings");
  return { errors: [], ok: true, message: "User added." };
}

export async function deleteUserAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await requireAdminVerified();
  if (!verifyCsrfToken(session.data, formData.get("csrf"))) return { errors: ["Invalid session."] };
  const userId = Number(formData.get("user_id"));
  if (userId > 0) await deleteUser(userId);
  revalidatePath("/settings");
  return { errors: [], ok: true, message: "User deleted." };
}

export async function addRule(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await requireAdminVerified();
  if (!verifyCsrfToken(session.data, formData.get("csrf"))) return { errors: ["Invalid session."] };
  const dummy = normalizePath(String(formData.get("dummy_path") ?? ""));
  const real = normalizePath(String(formData.get("real_path") ?? ""));
  const userId = Number(formData.get("user_id"));
  if (!dummy || !real || userId < 1) {
    return { errors: ["Dummy path, real path and a user are required."] };
  }
  if (collidesWithAppRoutes(dummy) || collidesWithAppRoutes(real)) {
    return { errors: ["Dummy and real paths must not collide with app routes."] };
  }
  if (dummy === real) return { errors: ["Dummy and real paths must be different."] };
  const user = await getUserById(userId);
  if (!user) return { errors: ["Unknown user."] };
  const collisions = await rulePathCollisions(dummy, real);
  if (collisions.length > 0) return { errors: ["Path already in use by another rule."] };
  try {
    await insertRule(dummy, real, userId);
  } catch (err) {
    if (isDupEntry(err)) return { errors: ["Path already in use by another rule."] };
    throw err;
  }
  revalidatePath("/settings");
  return { errors: [], ok: true, message: "Rule added." };
}

export async function deleteRuleAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await requireAdminVerified();
  if (!verifyCsrfToken(session.data, formData.get("csrf"))) return { errors: ["Invalid session."] };
  const ruleId = Number(formData.get("rule_id"));
  if (ruleId > 0) await deleteRule(ruleId);
  revalidatePath("/settings");
  return { errors: [], ok: true, message: "Rule deleted." };
}

export async function changePassword(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  if (!(await verifyOrigin())) return { errors: ["Invalid request origin."] };
  const session = await requireAdminVerified();
  if (!verifyCsrfToken(session.data, formData.get("csrf"))) return { errors: ["Invalid session."] };
  const adminId = session.data.admin_verified;
  if (!adminId) redirect("/login");
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const hash = await getAdminPasswordHash(adminId);
  if (!hash || !verifyPassword(current, hash)) {
    return { errors: ["Current password is incorrect."] };
  }
  if (next.length < 10) return { errors: ["New password must be at least 10 characters."] };
  await updateAdminPassword(adminId, hashPassword(next));
  await updateSessionData(session.id, session.data, adminId);
  const newToken = await regenerateSessionToken(session.id);
  await setSessionCookie(newToken);
  revalidatePath("/settings");
  return { errors: [], ok: true, message: "Password changed." };
}
