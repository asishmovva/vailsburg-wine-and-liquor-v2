import { logEvent, type OpsSeverity } from "@/lib/ops/logEvent";

type ErrorLike = Error | unknown;

export type OpsErrorInput = {
  source: string;
  eventType: string;
  error: ErrorLike;
  message?: string;
  severity?: OpsSeverity;
  orderId?: string | null;
  userId?: string | null;
  details?: Record<string, unknown> | null;
  persist?: boolean;
};

function getErrorMessage(error: ErrorLike) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") return error;
  return "unknown_error";
}

function getErrorName(error: ErrorLike) {
  if (error instanceof Error) {
    return error.name;
  }
  return "UnknownError";
}

function getErrorStack(error: ErrorLike) {
  if (error instanceof Error && error.stack) {
    return error.stack.split("\n").slice(0, 8).join("\n");
  }
  return null;
}

export async function logError(input: OpsErrorInput) {
  const errorMessage = getErrorMessage(input.error);
  const errorName = getErrorName(input.error);
  const errorStack = getErrorStack(input.error);

  await logEvent({
    source: input.source,
    eventType: input.eventType,
    severity: input.severity ?? "error",
    message: input.message ?? errorMessage,
    orderId: input.orderId ?? null,
    userId: input.userId ?? null,
    persist: input.persist,
    details: {
      errorMessage,
      errorName,
      ...(errorStack ? { errorStack } : {}),
      ...(input.details ?? {}),
    },
  });
}
