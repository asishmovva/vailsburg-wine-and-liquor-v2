import { NextResponse, type NextRequest } from "next/server";
import { logError } from "@/lib/ops/logError";
import { logEvent } from "@/lib/ops/logEvent";
import { requireAdmin } from "@/lib/server/requireAdmin";
import { getSypramSyncOverview, syncSypramToFirestore } from "@/lib/sypram/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;

  try {
    const overview = await getSypramSyncOverview();
    return NextResponse.json(overview);
  } catch (error) {
    await logError({
      source: "api/admin/sypram/sync",
      eventType: "SYNC_FAILURE",
      severity: "error",
      message: "Failed to fetch Sypram sync overview.",
      error,
      userId: admin.uid,
      persist: true,
    });
    return NextResponse.json({ error: "Unable to load sync overview." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;

  let dryRun = false;
  try {
    const body = (await request.json()) as { dryRun?: boolean };
    dryRun = Boolean(body?.dryRun);
  } catch {
    dryRun = false;
  }

  const result = await syncSypramToFirestore({
    dryRun,
    requestedBy: admin.email ?? admin.uid,
  });

  if (!result.ok) {
    await logEvent({
      source: "api/admin/sypram/sync",
      eventType: "SYNC_FAILURE",
      severity: "warning",
      message: "Sypram sync blocked by cooldown.",
      userId: admin.uid,
      details: {
        dryRun,
        nextAllowedAt: result.nextAllowedAt,
        lastRunAt: result.lastRunAt ?? null,
      },
      persist: true,
    });
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

  await logEvent({
    source: "api/admin/sypram/sync",
    eventType: "SYPRAM_SYNC_TRIGGERED",
    severity: "info",
    message: "Sypram sync run completed via admin trigger.",
    userId: admin.uid,
    details: {
      dryRun,
      runId: result.summary.runId,
      status: result.summary.errors > 0 ? "failed" : "success",
    },
    persist: result.summary.errors > 0,
  });

  return NextResponse.json(result);
}
