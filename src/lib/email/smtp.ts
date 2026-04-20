import "server-only";

import nodemailer from "nodemailer";
import type { EmailPayload, EmailResult } from "@/lib/email/types";

function getEnvValue(prefix: string, key: string) {
  return process.env[`${prefix}_${key}`];
}

function getSmtpConfig(prefix = "SMTP") {
  const host = getEnvValue(prefix, "HOST") ?? "";
  const portRaw = getEnvValue(prefix, "PORT") ?? "";
  const secure = getEnvValue(prefix, "SECURE") === "true";
  const user = getEnvValue(prefix, "USER") ?? "";
  const pass = getEnvValue(prefix, "PASS") ?? "";

  const port = Number.parseInt(portRaw, 10);

  if (!host || !user || !pass || !Number.isFinite(port)) {
    return null;
  }

  return { host, port, secure, auth: { user, pass } };
}

export async function sendEmail(
  payload: EmailPayload,
  options?: {
    prefix?: string;
    providerName?: string;
  }
): Promise<EmailResult> {
  const prefix = options?.prefix ?? "SMTP";
  const providerName = options?.providerName ?? "smtp";

  try {
    const config = getSmtpConfig(prefix);
    if (!config) {
      return {
        ok: false,
        provider: providerName,
        error: `${providerName} not configured.`,
      };
    }

    const transporter = nodemailer.createTransport(config);
    const info = await transporter.sendMail({
      to: payload.to,
      from: payload.from,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });

    return {
      ok: true,
      provider: providerName,
      messageId: info.messageId,
    };
  } catch (error) {
    return {
      ok: false,
      provider: providerName,
      error: (error as Error).message,
    };
  }
}
