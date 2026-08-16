import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { config } from "./config";

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (config.mail.mode === "log") {
    try {
      const dir = path.dirname(config.mail.logFile);
      fs.mkdirSync(dir, { recursive: true });
      const line = `[${new Date().toISOString()}] TO=${to} SUBJECT=${subject} BODY=${body.replace(/\n/g, "\\n")}\n`;
      fs.appendFileSync(config.mail.logFile, line, { flag: "a" });
      return true;
    } catch {
      return false;
    }
  }
  try {
    const transporter = nodemailer.createTransport({
      host: config.mail.smtp.host,
      port: config.mail.smtp.port,
      secure: false,
      requireTLS: true,
      auth: { user: config.mail.smtp.user, pass: config.mail.smtp.pass },
      connectionTimeout: 10_000,
    });
    await transporter.sendMail({
      from: `"${config.mail.fromName}" <${config.mail.from}>`,
      to,
      subject,
      text: body,
    });
    return true;
  } catch (err) {
    console.error("Mail send failed:", err);
    return false;
  }
}

export function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  const subject = "Your KMCQ GmbH verification code";
  const body = `Your one-time verification code is: ${code}\n\nThis code expires in 10 minutes and can only be used once.\n\nIf you did not request this code, please ignore this email.`;
  return sendEmail(to, subject, body);
}
