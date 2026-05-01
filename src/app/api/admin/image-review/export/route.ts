import { NextResponse, type NextRequest } from "next/server";
import type { ImageReviewDecision } from "@/lib/image-review/types";
import { writeReviewedMatches } from "@/lib/image-review/server";
import { adminRateLimit } from "@/lib/server/adminRateLimit";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportPayload = {
  decisions?: ImageReviewDecision[];
};

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  const { uid, email, error } = admin;
  if (error) return error;
  const limited = adminRateLimit("mutate", uid, req);
  if (limited) return limited;

  const payload = (await req.json()) as ExportPayload;
  const decisions = payload.decisions ?? [];

  const exportResult = writeReviewedMatches({
    decisions,
    reviewerUid: uid,
    reviewerEmail: email,
  });

  return NextResponse.json({
    exportPath: exportResult.exportPath,
    decisionsPath: exportResult.decisionsPath,
    approvedCount: exportResult.approvedCount,
    rejectedCount: decisions.filter((decision) => decision.action === "reject").length,
    totalDecisions: decisions.length,
    totalDecisionRecords: exportResult.totalDecisionRecords,
    appliedDecisionCount: exportResult.appliedDecisionCount,
    skippedOutsideScopeCount: exportResult.skippedOutsideScopeCount,
    reviewProgress: exportResult.reviewProgress,
  });
}
