import "server-only";

import type { EmailPayload, EmailResult } from "@/lib/email/types";
import { sendEmail as sendSmtpEmail } from "@/lib/email/smtp";

function resolveFallbackProvider() {
  if (process.env.EMAIL_FALLBACK_PROVIDER) {
    return process.env.EMAIL_FALLBACK_PROVIDER;
  }

  return process.env.SMTP_FALLBACK_HOST ? "smtp_fallback" : "";
}

function getPrimaryProvider() {
  return process.env.EMAIL_PROVIDER ?? "smtp";
}

async function sendViaProvider(
  provider: string,
  payload: EmailPayload
): Promise<EmailResult> {
  switch (provider) {
    case "smtp":
      return sendSmtpEmail(payload, {
        prefix: "SMTP",
        providerName: "smtp",
      });
    case "smtp_fallback":
      return sendSmtpEmail(payload, {
        prefix: "SMTP_FALLBACK",
        providerName: "smtp_fallback",
      });
    default:
      return {
        ok: false,
        provider,
        error: `Unsupported email provider: ${provider}`,
      };
  }
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  return sendViaProvider(getPrimaryProvider(), payload);
}

export async function sendEmailWithFallback(
  payload: EmailPayload
): Promise<EmailResult> {
  const attempts: NonNullable<EmailResult["attempts"]> = [];
  const primaryProvider = getPrimaryProvider();
  const primaryResult = await sendViaProvider(primaryProvider, payload);
  attempts.push({
    provider: primaryResult.provider ?? primaryProvider,
    ok: primaryResult.ok,
    error: primaryResult.error,
    messageId: primaryResult.messageId,
  });

  if (primaryResult.ok) {
    return {
      ...primaryResult,
      attempts,
    };
  }

  const fallbackProvider = resolveFallbackProvider();
  if (!fallbackProvider || fallbackProvider === primaryProvider) {
    return {
      ...primaryResult,
      attempts,
    };
  }

  const fallbackResult = await sendViaProvider(fallbackProvider, payload);
  attempts.push({
    provider: fallbackResult.provider ?? fallbackProvider,
    ok: fallbackResult.ok,
    error: fallbackResult.error,
    messageId: fallbackResult.messageId,
  });

  if (fallbackResult.ok) {
    return {
      ...fallbackResult,
      attempts,
    };
  }

  return {
    ok: false,
    provider: fallbackResult.provider ?? primaryResult.provider,
    error: fallbackResult.error ?? primaryResult.error,
    messageId: fallbackResult.messageId ?? primaryResult.messageId,
    attempts,
  };
}

export type { EmailPayload, EmailResult };
