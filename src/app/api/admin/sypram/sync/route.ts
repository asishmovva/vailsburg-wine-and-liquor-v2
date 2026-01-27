import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getSypramSyncOverview, syncSypramToFirestore } from "@/lib/sypram/sync";

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

  const overview = await getSypramSyncOverview();
  return NextResponse.json(overview);
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let dryRun = false;
  try {
    const body = (await request.json()) as { dryRun?: boolean };
    dryRun = Boolean(body?.dryRun);
  } catch {
    dryRun = false;
  }

  const result = await syncSypramToFirestore({
    dryRun,
    requestedBy: auth.email ?? auth.uid,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: "cooldown_active",
        nextAllowedAt: result.nextAllowedAt,
        lastRunAt: result.lastRunAt,
        lastStatus: result.lastStatus,
        lastSummary: result.lastSummary,
      },
      { status: 429 }
    );
  }

  return NextResponse.json(result);
}
