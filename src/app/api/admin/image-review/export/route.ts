import { NextResponse, type NextRequest } from "next/server";
import type { ImageReviewDecision, ReviewApprovedRecord } from "@/lib/image-review/types";
import { writeReviewedMatches } from "@/lib/image-review/server";
import { adminRateLimit } from "@/lib/server/adminRateLimit";
import { requireAdmin } from "@/lib/server/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportPayload = {
  decisions?: ImageReviewDecision[];
};

export async function POST(req: NextRequest) {
  const { uid, error } = await requireAdmin(req);
  if (error) return error;
  const limited = adminRateLimit("mutate", uid, req);
  if (limited) return limited;

  const payload = (await req.json()) as ExportPayload;
  const decisions = payload.decisions ?? [];

  const approved: ReviewApprovedRecord[] = decisions
    .filter(
      (decision): decision is Extract<ImageReviewDecision, { productId: string }> =>
        decision.action !== "reject" && Boolean(decision.productId)
    )
    .map((decision) => ({
      productId: decision.productId,
      imagePath: decision.sourceFilePath,
      confidence: decision.confidence,
      source: "manual_review",
    }));

  const exportPath = writeReviewedMatches(approved);

  return NextResponse.json({
    exportPath,
    approvedCount: approved.length,
    rejectedCount: decisions.filter((decision) => decision.action === "reject").length,
    totalDecisions: decisions.length,
  });
}
