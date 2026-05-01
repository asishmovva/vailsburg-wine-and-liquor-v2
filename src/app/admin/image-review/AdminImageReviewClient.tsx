"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { authedFetch } from "@/lib/client/authedFetch";
import type {
  ImageReviewDecision,
  ImageReviewItem,
  ImageReviewListResponse,
  PersistedImageReviewDecision,
} from "@/lib/image-review/types";

const PAGE_SIZE = 20;

type DecisionMap = Record<string, ImageReviewDecision>;

function decisionKey(item: ImageReviewItem) {
  return item.sourceFilePath;
}

function buildQuery(params: {
  page: number;
  category: string;
  search: string;
  minScore: string;
  maxScore: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(params.page));
  searchParams.set("pageSize", String(PAGE_SIZE));
  if (params.category) searchParams.set("category", params.category);
  if (params.search.trim()) searchParams.set("search", params.search.trim());
  if (params.minScore.trim()) searchParams.set("minScore", params.minScore.trim());
  if (params.maxScore.trim()) searchParams.set("maxScore", params.maxScore.trim());
  return searchParams.toString();
}

function toClientDecision(
  persisted: PersistedImageReviewDecision
): ImageReviewDecision {
  if (persisted.action === "reject") {
    return {
      sourceFilePath: persisted.sourceFilePath,
      sourceFileName: persisted.sourceFileName,
      action: "reject",
    };
  }

  return {
    sourceFilePath: persisted.sourceFilePath,
    sourceFileName: persisted.sourceFileName,
    action: persisted.action,
    productId: persisted.productId,
    confidence: persisted.confidence,
  };
}

export default function AdminImageReviewClient() {
  const [items, setItems] = useState<ImageReviewItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionMap>({});
  const [reviewProgress, setReviewProgress] = useState({
    totalNeedsReview: 0,
    reviewedCount: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
  });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = buildQuery({ page, category, search, minScore, maxScore });
      const response = await authedFetch(`/api/admin/image-review?${query}`);
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to load review data.");
      }

      const payload = (await response.json()) as ImageReviewListResponse;
      setItems(payload.items);
      setCategories(payload.filters.categories);
      setTotalPages(payload.pagination.totalPages);
      setTotalItems(payload.pagination.totalItems);
      setReviewProgress(payload.reviewProgress);
      setDecisions((current) => {
        const merged = { ...current };
        for (const item of payload.items) {
          if (!item.existingDecision) continue;
          const key = decisionKey(item);
          if (!merged[key]) {
            merged[key] = toClientDecision(item.existingDecision);
          }
        }
        return merged;
      });
    } catch (fetchError) {
      setError((fetchError as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, category, search, minScore, maxScore]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const reviewedCount = useMemo(
    () => Object.keys(decisions).length,
    [decisions]
  );

  const approvedCount = useMemo(
    () =>
      Object.values(decisions).filter(
        (decision) => decision.action === "approve" || decision.action === "alternate"
      ).length,
    [decisions]
  );

  const rejectCount = useMemo(
    () => Object.values(decisions).filter((decision) => decision.action === "reject").length,
    [decisions]
  );

  const setDecision = (item: ImageReviewItem, decision: ImageReviewDecision) => {
    setDecisions((current) => ({
      ...current,
      [decisionKey(item)]: decision,
    }));
  };

  const exportApprovedMatches = async () => {
    const exportable = Object.values(decisions);
    if (!exportable.length) {
      toast.error("Review at least one item before exporting.");
      return;
    }

    setExporting(true);
    try {
      const response = await authedFetch("/api/admin/image-review/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: exportable }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to export reviewed matches.");
      }

      const payload = (await response.json()) as {
        exportPath: string;
        decisionsPath: string;
        approvedCount: number;
        rejectedCount: number;
        totalDecisionRecords: number;
        appliedDecisionCount: number;
        skippedOutsideScopeCount: number;
        reviewProgress: {
          totalNeedsReview: number;
          reviewedCount: number;
          pendingCount: number;
          approvedCount: number;
          rejectedCount: number;
        };
      };
      setReviewProgress(payload.reviewProgress);
      if (payload.skippedOutsideScopeCount > 0) {
        toast.error(
          `${payload.skippedOutsideScopeCount} decision(s) were skipped because they are not in the current needs-review backlog.`
        );
      }
      toast.success(
        `Exported ${payload.approvedCount} approved matches (${payload.rejectedCount} rejected). Applied ${payload.appliedDecisionCount} decision updates. Decisions saved to ${payload.decisionsPath}.`
      );
    } catch (exportError) {
      toast.error((exportError as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900">Image Review</h1>
          <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Admin Only
          </span>
        </div>
        <p className="text-sm text-zinc-600">
          Review `needs_review.json` items, choose safe matches, and export
          `review_approved.json` for the existing attach script. Decisions persist
          in `review_decisions.json` so batches can be completed safely over multiple sessions.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-2 text-sm text-zinc-700">
            <span>Search</span>
            <Input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Filename or product name"
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => {
                setPage(1);
                setCategory(event.target.value);
              }}
              className="h-11 w-full rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            >
              <option value="">All categories</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span>Min score</span>
            <Input
              type="number"
              min="0"
              max="200"
              value={minScore}
              onChange={(event) => {
                setPage(1);
                setMinScore(event.target.value);
              }}
              placeholder="e.g. 70"
            />
          </label>

          <label className="space-y-2 text-sm text-zinc-700">
            <span>Max score</span>
            <Input
              type="number"
              min="0"
              max="200"
              value={maxScore}
              onChange={(event) => {
                setPage(1);
                setMaxScore(event.target.value);
              }}
              placeholder="e.g. 95"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
          <div className="flex flex-wrap gap-4">
            <span>Total review items: {totalItems}</span>
            <span>Reviewed this session: {reviewedCount}</span>
            <span>Approved: {approvedCount}</span>
            <span>Rejected: {rejectCount}</span>
            <span>Backlog pending: {reviewProgress.pendingCount}</span>
            <span>
              Overall progress: {reviewProgress.reviewedCount}/{reviewProgress.totalNeedsReview}
            </span>
          </div>

          <Button onClick={exportApprovedMatches} disabled={exporting}>
            {exporting ? "Exporting..." : "Export Approved Matches"}
          </Button>
        </div>
      </Card>

      {error ? (
        <Card className="text-sm text-red-600">{error}</Card>
      ) : null}

      {loading ? (
        <Card className="text-sm text-zinc-600">Loading review items...</Card>
      ) : null}

      {!loading && !items.length ? (
        <Card className="text-sm text-zinc-600">
          No review items match the current filters.
        </Card>
      ) : null}

      <div className="space-y-4">
        {items.map((item) => {
          const currentDecision = decisions[decisionKey(item)];
          const topCandidate = item.topCandidates[0];

          return (
            <Card key={item.id} className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50">
                    {item.previewSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.previewSrc}
                        alt={item.sourceFileName}
                        className="h-56 w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-56 items-center justify-center text-sm text-zinc-500">
                        Preview unavailable
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 text-sm text-zinc-600">
                    <p className="font-medium text-zinc-900">{item.sourceFileName}</p>
                    <p className="break-all">{item.sourceFilePath}</p>
                    <p>Parsed: {item.parsedName || "-"}</p>
                    <p>Category: {item.category || "-"}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">
                        Proposed match
                      </p>
                      <h2 className="text-xl font-semibold text-zinc-900">
                        {item.proposedProductName ?? "No proposed product"}
                      </h2>
                      <p className="text-sm text-zinc-600">
                        Score {item.score}
                        {item.proposedSize ? ` • ${item.proposedSize}` : ""}
                        {item.proposedPack ? ` • ${item.proposedPack}` : ""}
                      </p>
                    </div>

                    <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                      {currentDecision
                        ? currentDecision.action === "reject"
                          ? "Rejected"
                          : currentDecision.action === "alternate"
                            ? `Selected ${currentDecision.productId}`
                            : "Approved top candidate"
                        : "Pending review"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {topCandidate ? (
                      <Button
                        onClick={() =>
                          setDecision(item, {
                            sourceFilePath: item.sourceFilePath,
                            sourceFileName: item.sourceFileName,
                            action: "approve",
                            productId: topCandidate.productId,
                            confidence: topCandidate.score,
                          })
                        }
                      >
                        Approve top candidate
                      </Button>
                    ) : null}

                    <Button
                      variant="outline"
                      onClick={() =>
                        setDecision(item, {
                          sourceFilePath: item.sourceFilePath,
                          sourceFileName: item.sourceFileName,
                          action: "reject",
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Alternate candidates
                    </h3>

                    <div className="space-y-3">
                      {item.topCandidates.map((candidate, index) => (
                        <div
                          key={`${item.id}-${candidate.productId}`}
                          className="rounded-2xl border border-zinc-200 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-medium text-zinc-900">
                                {candidate.productName}
                              </p>
                              <p className="text-sm text-zinc-600">
                                Product ID {candidate.productId}
                                {candidate.size ? ` • ${candidate.size}` : ""}
                                {candidate.pack ? ` • ${candidate.pack}` : ""}
                                {` • Score ${candidate.score}`}
                                {index === 0 ? " • Top candidate" : ""}
                              </p>
                            </div>

                            <Button
                              variant={index === 0 ? "outline" : "primary"}
                              size="sm"
                              onClick={() =>
                                setDecision(item, {
                                  sourceFilePath: item.sourceFilePath,
                                  sourceFileName: item.sourceFileName,
                                  action: index === 0 ? "approve" : "alternate",
                                  productId: candidate.productId,
                                  confidence: candidate.score,
                                })
                              }
                            >
                              {index === 0 ? "Use top candidate" : "Use this candidate"}
                            </Button>
                          </div>

                          {candidate.reasons.length ? (
                            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600">
                              {candidate.reasons.map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
          </Button>
        </div>
      </Card>
    </div>
  );
}
