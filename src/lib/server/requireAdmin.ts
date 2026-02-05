import "server-only";

import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";

export async function requireAdmin(
  req: NextRequest
): Promise<{ uid: string; email: string | null; error: Response | null }> {
  const { auth, error } = await requireAuth(req);
  if (error || !auth) {
    return { uid: "", email: null, error: error ?? new Response("Unauthorized", { status: 401 }) };
  }

  const userSnap = await adminDb().collection("users").doc(auth.uid).get();
  const role = userSnap.data()?.role ?? "customer";
  if (role !== "admin") {
    return { uid: "", email: null, error: new Response("Forbidden", { status: 403 }) };
  }

  return { uid: auth.uid, email: auth.email, error: null };
}
