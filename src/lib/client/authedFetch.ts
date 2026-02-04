"use client";

import { auth } from "@/lib/firebase";

export async function authedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const user = auth?.currentUser;
  if (!user) {
    throw new Error("Not authenticated");
  }
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers,
  });
}
