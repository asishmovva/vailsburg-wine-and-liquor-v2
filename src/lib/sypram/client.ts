import "server-only";

import type { SypramItem, SypramResponse } from "@/lib/sypram/types";

const DEFAULT_BASE_URL = "https://DataServices.sypramsoftware.com";
const ITEM_LIST_PATH = "/api/Item/GetItemList";

function getEnvValue(key: string) {
  const value = process.env[key];
  return value ? value.trim() : "";
}

function getSypramConfig() {
  const baseUrl = getEnvValue("SYPRAM_BASE_URL") || DEFAULT_BASE_URL;
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

function extractItems(payload: SypramResponse): SypramItem[] {
  if (Array.isArray(payload)) return payload;
  const fallback =
    payload.ItemList ??
    payload.itemList ??
    payload.Items ??
    payload.items ??
    payload.Data ??
    payload.data ??
    [];
  return Array.isArray(fallback) ? fallback : [];
}

export async function fetchSypramItems() {
  const { baseUrl, user, password, pin } = getSypramConfig();
  const url = new URL(ITEM_LIST_PATH, baseUrl);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: buildAuthHeader(user, password, pin),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Sypram request failed (${response.status}): ${message}`);
  }

  const payload = (await response.json()) as SypramResponse;
  const items = extractItems(payload);

  if (!items.length) {
    throw new Error("Sypram response returned zero items.");
  }

  return items;
}
