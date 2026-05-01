import fs from "fs";
import path from "path";
import type {
  ImageReviewDecision,
  ImageReviewProgress,
  PersistedImageReviewDecision,
  ReviewApprovedRecord,
} from "@/lib/image-review/types";

type MergePersistedImageReviewDecisionsInput = {
  existing: PersistedImageReviewDecision[];
  incoming: ImageReviewDecision[];
  reviewedAt: string;
  reviewerUid: string;
  reviewerEmail: string | null;
  allowedSourcePaths?: Set<string>;
};

type MergePersistedImageReviewDecisionsResult = {
  merged: PersistedImageReviewDecision[];
  appliedCount: number;
  skippedOutsideScopeCount: number;
};

type PersistedReviewDecisionsFile = {
  version: 1;
  updatedAt: string;
  decisions: Record<string, PersistedImageReviewDecision>;
};

const REVIEW_DECISIONS_PATH = path.resolve(
  process.cwd(),
  "artifacts",
  "review_decisions.json"
);

function ensureArtifactsDir() {
  const artifactsDir = path.resolve(process.cwd(), "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function parsePersistedReviewDecision(
  candidate: unknown
): PersistedImageReviewDecision | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const record = candidate as Record<string, unknown>;
  const sourceFilePath =
    typeof record.sourceFilePath === "string" ? record.sourceFilePath : "";
  const sourceFileName =
    typeof record.sourceFileName === "string" ? record.sourceFileName : "";
  const reviewedAt = typeof record.reviewedAt === "string" ? record.reviewedAt : "";
  const reviewerUid =
    typeof record.reviewerUid === "string" ? record.reviewerUid : "";
  const reviewerEmail =
    typeof record.reviewerEmail === "string" ? record.reviewerEmail : null;

  if (!sourceFilePath || !sourceFileName || !reviewedAt || !reviewerUid) {
    return null;
  }

  if (record.action === "reject") {
    return {
      sourceFilePath,
      sourceFileName,
      action: "reject",
      reviewedAt,
      reviewerUid,
      reviewerEmail,
    };
  }

  const productId = typeof record.productId === "string" ? record.productId : "";
  const confidence =
    typeof record.confidence === "number" ? record.confidence : Number.NaN;
  if (
    (record.action !== "approve" && record.action !== "alternate") ||
    !productId ||
    !Number.isFinite(confidence)
  ) {
    return null;
  }

  return {
    sourceFilePath,
    sourceFileName,
    action: record.action,
    productId,
    confidence,
    reviewedAt,
    reviewerUid,
    reviewerEmail,
  };
}

export function loadPersistedReviewDecisions(): PersistedReviewDecisionsFile {
  if (!fs.existsSync(REVIEW_DECISIONS_PATH)) {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      decisions: {},
    };
  }

  try {
    const content = fs.readFileSync(REVIEW_DECISIONS_PATH, "utf8");
    const parsed = JSON.parse(content) as {
      version?: number;
      updatedAt?: string;
      decisions?: Record<string, unknown>;
    };
    const incomingDecisions = parsed.decisions ?? {};
    const normalizedDecisions: Record<string, PersistedImageReviewDecision> = {};

    for (const [sourceFilePath, rawDecision] of Object.entries(incomingDecisions)) {
      const normalized = parsePersistedReviewDecision(rawDecision);
      if (!normalized || normalized.sourceFilePath !== sourceFilePath) {
        continue;
      }
      normalizedDecisions[sourceFilePath] = normalized;
    }

    return {
      version: 1,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date(0).toISOString(),
      decisions: normalizedDecisions,
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      decisions: {},
    };
  }
}

export function writePersistedReviewDecisions(
  decisions: Record<string, PersistedImageReviewDecision>
) {
  ensureArtifactsDir();
  const sortedEntries = Object.entries(decisions).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const payload: PersistedReviewDecisionsFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    decisions: Object.fromEntries(sortedEntries),
  };
  fs.writeFileSync(REVIEW_DECISIONS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return REVIEW_DECISIONS_PATH;
}

function isApprovedDecision(
  decision: PersistedImageReviewDecision
): decision is PersistedImageReviewDecision & {
  action: "approve" | "alternate";
  productId: string;
  confidence: number;
} {
  return decision.action !== "reject";
}

export function mergePersistedImageReviewDecisions({
  existing,
  incoming,
  reviewedAt,
  reviewerUid,
  reviewerEmail,
  allowedSourcePaths,
}: MergePersistedImageReviewDecisionsInput): MergePersistedImageReviewDecisionsResult {
  const byPath = new Map<string, PersistedImageReviewDecision>();

  for (const decision of existing) {
    byPath.set(decision.sourceFilePath, decision);
  }

  let appliedCount = 0;
  let skippedOutsideScopeCount = 0;

  for (const decision of incoming) {
    if (!decision.sourceFilePath.trim()) {
      continue;
    }

    if (
      allowedSourcePaths &&
      !allowedSourcePaths.has(decision.sourceFilePath)
    ) {
      skippedOutsideScopeCount += 1;
      continue;
    }

    byPath.set(decision.sourceFilePath, {
      ...decision,
      reviewedAt,
      reviewerUid,
      reviewerEmail,
    });
    appliedCount += 1;
  }

  const merged = Array.from(byPath.values()).sort((left, right) =>
    left.sourceFilePath.localeCompare(right.sourceFilePath)
  );

  return {
    merged,
    appliedCount,
    skippedOutsideScopeCount,
  };
}

export function summarizeImageReviewProgress({
  needsReviewSourcePaths,
  decisions,
}: {
  needsReviewSourcePaths: string[];
  decisions: PersistedImageReviewDecision[];
}): ImageReviewProgress {
  const uniqueNeedsReview = new Set(needsReviewSourcePaths);
  const decisionsByPath = new Map<string, PersistedImageReviewDecision>();

  for (const decision of decisions) {
    decisionsByPath.set(decision.sourceFilePath, decision);
  }

  let approvedCount = 0;
  let rejectedCount = 0;

  for (const sourceFilePath of uniqueNeedsReview) {
    const decision = decisionsByPath.get(sourceFilePath);
    if (!decision) continue;

    if (decision.action === "reject") {
      rejectedCount += 1;
    } else {
      approvedCount += 1;
    }
  }

  const reviewedCount = approvedCount + rejectedCount;
  return {
    totalNeedsReview: uniqueNeedsReview.size,
    reviewedCount,
    pendingCount: Math.max(uniqueNeedsReview.size - reviewedCount, 0),
    approvedCount,
    rejectedCount,
  };
}

export function buildReviewApprovedRecords({
  decisions,
  allowedSourcePaths,
}: {
  decisions: PersistedImageReviewDecision[];
  allowedSourcePaths: Set<string>;
}): ReviewApprovedRecord[] {
  return decisions
    .filter((decision) => allowedSourcePaths.has(decision.sourceFilePath))
    .filter(isApprovedDecision)
    .map((decision) => ({
      productId: decision.productId,
      imagePath: decision.sourceFilePath,
      confidence: decision.confidence,
      source: "manual_review" as const,
    }))
    .sort((left, right) => left.imagePath.localeCompare(right.imagePath));
}
