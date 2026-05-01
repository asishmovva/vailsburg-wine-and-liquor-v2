import { describe, expect, it } from "vitest";
import {
  buildReviewApprovedRecords,
  mergePersistedImageReviewDecisions,
  summarizeImageReviewProgress,
} from "@/lib/image-review/reviewDecisions";
import type { PersistedImageReviewDecision } from "@/lib/image-review/types";

describe("mergePersistedImageReviewDecisions", () => {
  it("merges incoming decisions and preserves unrelated existing records", () => {
    const existing: PersistedImageReviewDecision[] = [
      {
        sourceFilePath: "images/a.jpg",
        sourceFileName: "a.jpg",
        action: "approve",
        productId: "prod-a",
        confidence: 91,
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewerUid: "admin-old",
        reviewerEmail: "old@example.com",
      },
      {
        sourceFilePath: "images/b.jpg",
        sourceFileName: "b.jpg",
        action: "reject",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        reviewerUid: "admin-old",
        reviewerEmail: "old@example.com",
      },
    ];

    const result = mergePersistedImageReviewDecisions({
      existing,
      incoming: [
        {
          sourceFilePath: "images/a.jpg",
          sourceFileName: "a.jpg",
          action: "alternate",
          productId: "prod-a2",
          confidence: 88,
        },
      ],
      reviewedAt: "2026-05-01T12:00:00.000Z",
      reviewerUid: "admin-new",
      reviewerEmail: "new@example.com",
    });

    expect(result.appliedCount).toBe(1);
    expect(result.skippedOutsideScopeCount).toBe(0);
    expect(result.merged).toHaveLength(2);
    expect(result.merged).toContainEqual(
      expect.objectContaining({
        sourceFilePath: "images/a.jpg",
        action: "alternate",
        productId: "prod-a2",
        reviewerUid: "admin-new",
      })
    );
    expect(result.merged).toContainEqual(
      expect.objectContaining({
        sourceFilePath: "images/b.jpg",
        action: "reject",
        reviewerUid: "admin-old",
      })
    );
  });

  it("skips incoming decisions that are out of scope", () => {
    const result = mergePersistedImageReviewDecisions({
      existing: [],
      incoming: [
        {
          sourceFilePath: "images/outside.jpg",
          sourceFileName: "outside.jpg",
          action: "reject",
        },
      ],
      reviewedAt: "2026-05-01T12:00:00.000Z",
      reviewerUid: "admin-new",
      reviewerEmail: "new@example.com",
      allowedSourcePaths: new Set(["images/allowed.jpg"]),
    });

    expect(result.appliedCount).toBe(0);
    expect(result.skippedOutsideScopeCount).toBe(1);
    expect(result.merged).toEqual([]);
  });
});

describe("summarizeImageReviewProgress", () => {
  it("counts reviewed/approved/rejected against needs-review scope", () => {
    const decisions: PersistedImageReviewDecision[] = [
      {
        sourceFilePath: "images/a.jpg",
        sourceFileName: "a.jpg",
        action: "approve",
        productId: "prod-a",
        confidence: 90,
        reviewedAt: "2026-05-01T12:00:00.000Z",
        reviewerUid: "admin-1",
        reviewerEmail: null,
      },
      {
        sourceFilePath: "images/b.jpg",
        sourceFileName: "b.jpg",
        action: "reject",
        reviewedAt: "2026-05-01T12:00:00.000Z",
        reviewerUid: "admin-1",
        reviewerEmail: null,
      },
      {
        sourceFilePath: "images/outside.jpg",
        sourceFileName: "outside.jpg",
        action: "approve",
        productId: "prod-z",
        confidence: 70,
        reviewedAt: "2026-05-01T12:00:00.000Z",
        reviewerUid: "admin-1",
        reviewerEmail: null,
      },
    ];

    const progress = summarizeImageReviewProgress({
      needsReviewSourcePaths: ["images/a.jpg", "images/b.jpg", "images/c.jpg"],
      decisions,
    });

    expect(progress).toEqual({
      totalNeedsReview: 3,
      reviewedCount: 2,
      pendingCount: 1,
      approvedCount: 1,
      rejectedCount: 1,
    });
  });
});

describe("buildReviewApprovedRecords", () => {
  it("includes only in-scope approved/alternate decisions", () => {
    const decisions: PersistedImageReviewDecision[] = [
      {
        sourceFilePath: "images/a.jpg",
        sourceFileName: "a.jpg",
        action: "approve",
        productId: "prod-a",
        confidence: 90,
        reviewedAt: "2026-05-01T12:00:00.000Z",
        reviewerUid: "admin-1",
        reviewerEmail: null,
      },
      {
        sourceFilePath: "images/b.jpg",
        sourceFileName: "b.jpg",
        action: "alternate",
        productId: "prod-b",
        confidence: 83,
        reviewedAt: "2026-05-01T12:00:00.000Z",
        reviewerUid: "admin-1",
        reviewerEmail: null,
      },
      {
        sourceFilePath: "images/c.jpg",
        sourceFileName: "c.jpg",
        action: "reject",
        reviewedAt: "2026-05-01T12:00:00.000Z",
        reviewerUid: "admin-1",
        reviewerEmail: null,
      },
    ];

    const approved = buildReviewApprovedRecords({
      decisions,
      allowedSourcePaths: new Set(["images/a.jpg", "images/c.jpg"]),
    });

    expect(approved).toEqual([
      {
        productId: "prod-a",
        imagePath: "images/a.jpg",
        confidence: 90,
        source: "manual_review",
      },
    ]);
  });
});
