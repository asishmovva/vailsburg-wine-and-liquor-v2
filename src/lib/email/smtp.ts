import "server-only";

import nodemailer from "nodemailer";
import type { EmailPayload, EmailResult } from "@/lib/email/types";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST ?? "";
  const portRaw = process.env.SMTP_PORT ?? "";
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";

  const port = Number.parseInt(portRaw, 10);

  if (!host || !user || !pass || !Number.isFinite(port)) {
    return null;
  }

  return { host, port, secure, auth: { user, pass } };
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  try {
    const config = getSmtpConfig();
    if (!config) {
      return { ok: false, error: "SMTP not configured." };
    }

    const transporter = nodemailer.createTransport(config);
    await transporter.sendMail({
      to: payload.to,
      from: payload.from,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
