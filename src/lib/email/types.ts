export type EmailPayload = {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
};

export type EmailResult = {
  ok: boolean;
  error?: string;
};
