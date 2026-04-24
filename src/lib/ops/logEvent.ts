import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";

export type OpsSeverity = "info" | "warning" | "error" | "critical";

export type OpsEventInput = {
  source: string;
  eventType: string;
  message: string;
  severity?: OpsSeverity;
  orderId?: string | null;
  userId?: string | null;
  details?: Record<string, unknown> | null;
  persist?: boolean;
};

const OPS_LOG_COLLECTION = "opsLogs";

function normalizeDetails(details?: Record<string, unknown> | null) {
  if (!details) return null;
  try {
    return JSON.parse(JSON.stringify(details)) as Record<string, unknown>;
  } catch {
    return {
      note: "details_not_serializable",
    };
  }
}

function shouldPersistEvent(severity: OpsSeverity, persist?: boolean) {
  if (typeof persist === "boolean") return persist;
  return severity === "error" || severity === "critical";
}

function getLogger(severity: OpsSeverity) {
  if (severity === "critical" || severity === "error") return console.error;
  if (severity === "warning") return console.warn;
  return console.log;
}

export async function logEvent(input: OpsEventInput) {
  const severity = input.severity ?? "info";
  const details = normalizeDetails(input.details);
  const createdAtIso = new Date().toISOString();

  const payload = {
    source: input.source,
    eventType: input.eventType,
    orderId: input.orderId ?? null,
    userId: input.userId ?? null,
    severity,
    message: input.message,
    details,
    createdAt: createdAtIso,
  };

  getLogger(severity)("[ops]", payload);

  if (!shouldPersistEvent(severity, input.persist)) {
    return;
  }

  try {
    await adminDb().collection(OPS_LOG_COLLECTION).add({
      source: input.source,
      eventType: input.eventType,
      orderId: input.orderId ?? null,
      userId: input.userId ?? null,
      severity,
      message: input.message,
      details,
      createdAt: FieldValue.serverTimestamp(),
      createdAtIso,
    });
  } catch (error) {
    console.error("[ops] log_write_failed", {
      source: input.source,
      eventType: input.eventType,
      severity,
      reason: (error as Error).message,
    });
  }
}
