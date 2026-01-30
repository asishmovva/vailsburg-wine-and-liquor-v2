import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { fetchPosQueueSummary } from "@/lib/pos/posQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : "";

  if (!token) {
    return { ok: false, status: 401, error: "Unauthorized." } as const;
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const userDoc = await adminDb().collection("users").doc(decoded.uid).get();
    const role = userDoc.data()?.role ?? "customer";
    if (role !== "admin") {
      return { ok: false, status: 403, error: "Forbidden." } as const;
    }
    return {
      ok: true,
      uid: decoded.uid,
      email: decoded.email ?? null,
    } as const;
  } catch {
    return { ok: false, status: 401, error: "Unauthorized." } as const;
  }
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const summary = await fetchPosQueueSummary();
  return NextResponse.json(summary);
}
