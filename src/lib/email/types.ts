export type EmailPayload = {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
};

export type EmailAttemptResult = {
  provider: string;
  ok: boolean;
  error?: string;
  messageId?: string;
};

export type EmailResult = {
  ok: boolean;
  provider?: string;
  messageId?: string;
  error?: string;
  attempts?: EmailAttemptResult[];
};
