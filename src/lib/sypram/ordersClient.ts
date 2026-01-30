import "server-only";

import type {
  SypramOrderPayload,
  SypramOrderResponse,
} from "@/lib/sypram/orderTypes";

const DEFAULT_ORDER_BASE_URL = "https://DataServicesUAT.sypramsoftware.com";
const ORDER_PUSH_PATH = "/api/Order/PushOrderInPOS";

function getEnvValue(key: string) {
  const value = process.env[key];
  return value ? value.trim() : "";
}

function getSypramConfig() {
  const baseUrl = getEnvValue("SYPRAM_ORDER_BASE_URL") || DEFAULT_ORDER_BASE_URL;
  const user = getEnvValue("SYPRAM_USERID");
  const password = getEnvValue("SYPRAM_PASSWORD");
  const pin = getEnvValue("SYPRAM_PIN");

  if (!user || !password || !pin) {
    throw new Error("Missing Sypram credentials in env vars.");
  }

  return { baseUrl, user, password, pin };
}

function buildAuthHeader(user: string, password: string, pin: string) {
  const authInfo = `${user}:${password}:${pin}`;
  const encoded = Buffer.from(authInfo).toString("base64");
  return `Basic ${encoded}`;
}

function parseSypramResponse(payload: SypramOrderResponse) {
  const ok = payload.StatusVal !== false;
  return {
    ok,
    message: payload.StatusMsg ?? null,
    posOrderId: payload.posOrderId ?? payload.POSOrderId ?? null,
    posReceiptNo: payload.receiptNo ?? payload.ReceiptNo ?? null,
  };
}

export async function pushSypramOrder(payload: SypramOrderPayload) {
  const { baseUrl, user, password, pin } = getSypramConfig();
  const url = new URL(ORDER_PUSH_PATH, baseUrl);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: buildAuthHeader(user, password, pin),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Sypram order push failed (${response.status}): ${message}`);
  }

  const data = (await response.json()) as SypramOrderResponse;
  const parsed = parseSypramResponse(data);

  if (!parsed.ok) {
    throw new Error(parsed.message ?? "Sypram order rejected.");
  }

  return {
    ok: true,
    raw: data,
    posOrderId: parsed.posOrderId,
    posReceiptNo: parsed.posReceiptNo,
  };
}
