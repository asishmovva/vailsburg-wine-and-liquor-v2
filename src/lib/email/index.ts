import "server-only";

import type { EmailPayload, EmailResult } from "@/lib/email/types";
import { sendEmail as sendSmtpEmail } from "@/lib/email/smtp";

const provider = process.env.EMAIL_PROVIDER ?? "smtp";

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  if (provider === "smtp") {
    return sendSmtpEmail(payload);
  }
  return { ok: false, error: `Unsupported email provider: ${provider}` };
}

export type { EmailPayload, EmailResult };
